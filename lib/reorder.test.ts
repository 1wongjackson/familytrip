import { describe, expect, it } from "vitest";
import type { DayPlan } from "./plan-schema";
import { estimateLeg, haversineKm, isPermutation, permute, retime } from "./reorder";
import type { PlanLive, StopLive } from "./types";

const stop = (start: string, end: string, place: string, mode: DayPlan["stops"][number]["getThere"]["mode"], minutes: number) => ({
  start,
  end,
  place,
  area: "",
  why: "",
  trivia: "",
  food: "",
  getThere: { mode, minutes, note: "" },
});

const plan: DayPlan = {
  title: "T",
  pitch: "",
  style: "mixed",
  totalHours: 6,
  costBand: "$",
  costNote: "",
  stops: [stop("09:00", "10:00", "A", "walk", 10), stop("10:20", "12:00", "B", "metro", 20), stop("12:30", "13:30", "C", "bus", 30)],
  fitsMembers: [],
  tradeoffs: [],
};

const at = (latitude: number, longitude: number) => ({ latitude, longitude });
const liveStop = (location: { latitude: number; longitude: number }, routeMinutes: number, extra: Partial<StopLive> = {}): StopLive => ({
  found: true,
  name: "",
  address: "",
  mapsUri: "",
  photoUri: "",
  photoAttribution: "",
  rating: null,
  openStatus: "open",
  hoursText: "",
  routeMinutes,
  location,
  ...extra,
});

// Monday 09:00–17:00 only (Google: 0 = Sunday).
const monday9to5 = [{ open: { day: 1, hour: 9 }, close: { day: 1, hour: 17 } }];

const live: PlanLive = {
  checkedAt: 0,
  hotel: { name: "Hotel", location: at(0, 0) },
  utcOffsetMinutes: 540,
  stops: [
    liveStop(at(0, 0.005), 8),
    liveStop(at(0, 0.1), 22),
    liveStop(at(0, 0.2), 25, { periods: [{ open: { day: 1, hour: 12 }, close: { day: 1, hour: 14 } }] }),
  ],
};

describe("distance helpers", () => {
  it("haversineKm is about 111 km per degree at the equator", () => {
    expect(haversineKm(at(0, 0), at(0, 1))).toBeCloseTo(111.2, 0);
  });
  it("estimateLeg walks short hops and swaps a long walk for a taxi", () => {
    expect(estimateLeg(0.8, "metro").mode).toBe("walk");
    expect(estimateLeg(6, "walk")).toEqual({ mode: "taxi", minutes: 19 });
    expect(estimateLeg(9, "metro")).toEqual({ mode: "metro", minutes: 38 });
  });
  it("isPermutation rejects duplicates and out-of-range indexes", () => {
    expect(isPermutation([2, 0, 1], 3)).toBe(true);
    expect(isPermutation([0, 0, 1], 3)).toBe(false);
    expect(isPermutation([0, 1, 3], 3)).toBe(false);
    expect(isPermutation([0, 1], 3)).toBe(false);
  });
});

describe("permute", () => {
  it("keeps legs between stops that stay neighbours and estimates new ones", () => {
    const r = permute(plan, live, [0, 2, 1], "Leo");
    expect(r.data.stops.map((s) => s.place)).toEqual(["A", "C", "B"]);
    expect(r.changedLegs).toEqual([1, 2]); // A→C and C→B are new
    expect(r.live!.stops[0].routeMinutes).toBe(8); // hotel→A unchanged
    expect(r.live!.stops[1].routeMinutes).toBeNull();
    expect(r.data.stops[1].getThere.note).toMatch(/estimated from distance/);
    expect(r.live!.reorderedBy).toBe("Leo");
  });
  it("doesn't mutate the original plan", () => {
    permute(plan, live, [2, 1, 0], "Leo");
    expect(plan.stops.map((s) => s.place)).toEqual(["A", "B", "C"]);
    expect(plan.stops[0].getThere.note).toBe("");
  });
});

describe("retime", () => {
  it("keeps the day's start and each stop's length, adding travel between", () => {
    const r = permute(plan, live, [0, 2, 1], "Leo");
    r.live!.stops[1].routeMinutes = 40; // A→C, real route
    r.live!.stops[2].routeMinutes = 15; // C→B
    const t = retime(r.data, r.live, 1, "09:00");
    expect(t.data.stops.map((s) => `${s.place} ${s.start}-${s.end}`)).toEqual(["A 09:00-10:00", "C 10:40-11:40", "B 11:55-13:35"]);
    expect(t.data.totalHours).toBe(4.5);
  });
  it("re-checks opening hours with the new times", () => {
    const r = permute(plan, live, [0, 2, 1], "Leo");
    r.live!.stops[1].routeMinutes = 40;
    r.live!.stops[2].routeMinutes = 15;
    // C now runs 10:40–11:40, before its 12:00 opening.
    expect(retime(r.data, r.live, 1, "09:00").live!.stops[1].openStatus).toBe("outside");
    expect(retime(plan, { ...live, stops: live.stops.map((s, i) => (i === 0 ? { ...s, periods: monday9to5 } : s)) }, 1, "09:00").live!.stops[0].openStatus).toBe("open");
  });
  it("marks hours unknown when a stop moves and its periods weren't saved", () => {
    const old: PlanLive = { ...live, stops: live.stops.map((s) => ({ ...s, periods: undefined })) };
    const r = permute(plan, old, [1, 0, 2], "Leo");
    expect(retime(r.data, r.live, 1, "09:00").live!.stops[1].openStatus).toBe("unknown");
  });
});
