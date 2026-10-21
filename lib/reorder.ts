import type { DayPlan } from "./plan-schema";
import { checkOpen } from "./places";
import type { LatLng, PlanLive, StopLive } from "./types";

// Rearranging a plan's stops on the map. Pure functions: the API route adds
// real travel times for the new legs, then calls retime() again.

type Mode = DayPlan["stops"][number]["getThere"]["mode"];

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Rough door-to-door estimate from straight-line distance, used until a real
// route comes back.
export function estimateLeg(km: number, preferred: Mode): { mode: Mode; minutes: number } {
  if (km < 1.5) return { mode: "walk", minutes: Math.max(2, Math.round((km * 1.3 * 60) / 4.5)) };
  const mode: Mode = preferred === "walk" ? "taxi" : preferred;
  if (mode === "taxi" || mode === "car") return { mode, minutes: Math.round((km * 60) / 25) + 5 };
  return { mode, minutes: Math.round((km * 60) / 18) + 8 };
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function toHhmm(min: number): string {
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function isPermutation(order: number[], n: number): boolean {
  return order.length === n && new Set(order).size === n && order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
}

export interface Reordered {
  data: DayPlan;
  live: PlanLive | null;
  changedLegs: number[]; // positions whose travel needs a real route
}

// Puts the stops in the new order. Legs between stops that were already
// neighbours keep their travel; new pairs get a distance estimate.
export function permute(data: DayPlan, live: PlanLive | null, order: number[], by: string): Reordered {
  const stops = order.map((i) => structuredClone(data.stops[i]));
  const liveStops: StopLive[] | null = live ? order.map((i) => ({ ...live.stops[i] })) : null;
  const changedLegs: number[] = [];

  order.forEach((orig, k) => {
    const prevOrig = k === 0 ? -1 : order[k - 1];
    if (prevOrig === orig - 1) return; // same leg as before
    changedLegs.push(k);
    const from = k === 0 ? live?.hotel?.location : liveStops?.[k - 1]?.location;
    const to = liveStops?.[k]?.location;
    if (liveStops) liveStops[k].routeMinutes = null;
    if (from && to) {
      const leg = estimateLeg(haversineKm(from, to), stops[k].getThere.mode);
      stops[k].getThere = { ...leg, note: "New order: estimated from distance." };
    } else {
      stops[k].getThere = { ...stops[k].getThere, note: "New order: travel time not checked." };
    }
  });

  return {
    data: { ...data, stops },
    live: live && liveStops ? { ...live, stops: liveStops, reorderedBy: by } : null,
    changedLegs,
  };
}

// Re-times the day from the original start, keeping each stop's length, and
// re-checks opening hours where the periods are known.
export function retime(data: DayPlan, live: PlanLive | null, weekday: number, dayStart: string): { data: DayPlan; live: PlanLive | null } {
  let t = toMin(dayStart);
  const stops = data.stops.map((s, k) => {
    const length = Math.max(0, (toMin(s.end) - toMin(s.start) + 1440) % 1440);
    if (k > 0) t += live?.stops[k]?.routeMinutes ?? s.getThere.minutes;
    const start = toHhmm(t);
    t += length;
    return { ...s, start, end: toHhmm(t) };
  });

  const liveStops = live?.stops.map((l, k) => {
    if (!l.found) return l;
    if (l.periods && l.periods.length > 0) return { ...l, openStatus: checkOpen(l.periods, weekday, stops[k].start, stops[k].end) };
    const moved = stops[k].start !== data.stops[k].start || stops[k].end !== data.stops[k].end;
    return moved ? { ...l, openStatus: "unknown" as const } : l;
  });

  const totalHours = Math.round(((toMin(stops[stops.length - 1].end) - toMin(stops[0].start) + 1440) % 1440) / 15) / 4;
  return { data: { ...data, stops, totalHours }, live: live && liveStops ? { ...live, stops: liveStops } : null };
}
