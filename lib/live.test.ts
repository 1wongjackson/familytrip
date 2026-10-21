import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planConflicts } from "./conflicts";
import { buildPrompt, generatePlans, parsePlanSetText, provider } from "./generate";
import { checkOpen, enrichPlans, weekdayOf } from "./places";
import { departureIso, minusMinutes, pickMinutes, userAgent } from "./transitous";
import { samplePlans } from "./sample-plans";
import type { Answer, Member, StopLive, StoredPlan, Trip } from "./types";

const members: Member[] = [
  { id: 1, name: "Sam", role: "parent", age: 42 },
  { id: 2, name: "Alex", role: "parent", age: 40 },
  { id: 3, name: "Mia", role: "kid", age: 12 },
  { id: 4, name: "Leo", role: "kid", age: 6 },
];
const answers: Answer[] = members.map((m) => ({
  memberId: m.id,
  energy: 3,
  mustDo: "",
  mustAvoid: "",
  food: "",
  maxTravelMinutes: m.id === 4 ? 20 : 45,
  budget: "ok",
  submittedAt: 0,
}));
// 2026-11-02 is a Monday.
const trip: Trip = {
  slug: "abc",
  destination: "Kyoto",
  date: "2026-11-02",
  hotelArea: "Gion",
  createdAt: 0,
  agreedPlanId: null,
  agreedAt: null,
};
const input = { trip, members, answers, previousPlans: [], previousVotes: [] };
const plans = samplePlans(input);

const stopLive = (extra: Partial<StopLive> = {}): StopLive => ({
  found: true,
  name: "x",
  address: "",
  mapsUri: "",
  photoUri: "",
  photoAttribution: "",
  rating: null,
  openStatus: "open",
  hoursText: "",
  routeMinutes: null,
  ...extra,
});

describe("checkOpen", () => {
  // Mon–Fri 09:00–17:00 (Google: 0 = Sunday).
  const weekdays = [1, 2, 3, 4, 5].map((day) => ({ open: { day, hour: 9 }, close: { day, hour: 17 } }));

  it("is open when the visit fits inside a period", () => {
    expect(checkOpen(weekdays, 1, "10:00", "12:00")).toBe("open");
  });
  it("is partly open when the visit runs past closing", () => {
    expect(checkOpen(weekdays, 1, "16:00", "18:00")).toBe("partly");
  });
  it("is outside hours when the visit ends before opening on an open day", () => {
    expect(checkOpen(weekdays, 1, "08:00", "09:00")).toBe("outside");
    expect(checkOpen(weekdays, 1, "18:00", "19:00")).toBe("outside");
  });
  it("is closed on a day with no period", () => {
    expect(checkOpen(weekdays, 0, "10:00", "12:00")).toBe("closed");
  });
  it("treats a lone period with no close as always open", () => {
    expect(checkOpen([{ open: { day: 0 } }], 3, "02:00", "03:00")).toBe("open");
  });
  it("handles a period past midnight, and Saturday into Sunday", () => {
    const night = [{ open: { day: 6, hour: 18 }, close: { day: 0, hour: 2 } }];
    expect(checkOpen(night, 6, "22:00", "23:30")).toBe("open");
    expect(checkOpen(night, 0, "00:30", "01:30")).toBe("open");
  });
  it("is unknown without hours", () => {
    expect(checkOpen(undefined, 1, "10:00", "11:00")).toBe("unknown");
  });
});

describe("helpers", () => {
  it("weekdayOf uses Sunday = 0", () => {
    expect(weekdayOf("2026-11-02")).toBe(1);
    expect(weekdayOf("2026-11-01")).toBe(0);
  });
  it("turns local trip time into UTC using the destination's offset", () => {
    expect(departureIso("2026-11-02", "10:30", 540)).toBe("2026-11-02T01:30:00.000Z"); // Japan, UTC+9
    expect(departureIso("2026-11-02", "08:00", -300)).toBe("2026-11-02T13:00:00.000Z"); // UTC-5
    expect(minusMinutes("09:30", 15)).toBe("09:15");
    expect(minusMinutes("00:10", 20)).toBe("23:50");
  });
  it("picks walk, car or the fastest transit itinerary by mode", () => {
    const res = {
      itineraries: [{ duration: 1260 }, { duration: 780 }],
      direct: [
        { duration: 480, legs: [{ mode: "CAR" }] },
        { duration: 2820, legs: [{ mode: "WALK" }] },
      ],
    };
    expect(pickMinutes(res, "walk")).toBe(47);
    expect(pickMinutes(res, "taxi")).toBe(8);
    expect(pickMinutes(res, "metro")).toBe(13);
    expect(pickMinutes({}, "bus")).toBeNull();
  });
  it("identifies the app to Transitous, with contact when set", () => {
    delete process.env.FAMILYTRIP_CONTACT;
    expect(userAgent()).toBe("familytrip/0.1 (family trip planner prototype)");
    process.env.FAMILYTRIP_CONTACT = "me@example.com";
    expect(userAgent()).toContain("; me@example.com)");
    delete process.env.FAMILYTRIP_CONTACT;
  });
  it("parsePlanSetText finds JSON wrapped in prose or fences", () => {
    const json = JSON.stringify({ plans, notes: "n" });
    expect(parsePlanSetText("```json\n" + json + "\n```")?.plans).toHaveLength(3);
    expect(parsePlanSetText("Sorry, I can't")).toBeNull();
  });
});

describe("live conflicts", () => {
  it("flags closed stops and real travel over a member's limit", () => {
    const plan: StoredPlan = {
      id: 1,
      round: 1,
      idx: 0,
      data: plans[0],
      live: {
        checkedAt: 0,
        stops: [stopLive(), stopLive({ openStatus: "closed", hoursText: "Monday: Closed" }), stopLive({ routeMinutes: 30 }), stopLive()],
      },
    };
    const c = planConflicts(plan, members, [], answers);
    expect(c).toContainEqual({
      memberName: "Everyone",
      kind: "closed",
      detail: `${plans[0].stops[1].place} is closed that day (Monday: Closed)`,
    });
    expect(c).toContainEqual({
      memberName: "Leo",
      kind: "travel",
      detail: `Getting to ${plans[0].stops[2].place} really takes 30 min, over their limit`,
    });
  });

  it("feeds Google facts into the next round's prompt", () => {
    const prev: StoredPlan = {
      id: 1,
      round: 1,
      idx: 0,
      data: plans[0],
      live: { checkedAt: 0, stops: [stopLive({ openStatus: "closed" }), stopLive(), stopLive(), stopLive()] },
    };
    expect(buildPrompt({ ...input, previousPlans: [prev] })).toContain(`Google Maps: ${plans[0].stops[0].place} is closed that day`);
  });
});

describe("with stubbed APIs", () => {
  const env = { ...process.env };
  beforeEach(() => {
    delete process.env.FAMILYTRIP_MOCK;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.OPENCODE_BASE_URL;
    delete process.env.FAMILYTRIP_MODEL;
    delete process.env.GOOGLE_MAPS_API_KEY;
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("picks OpenCode first, then Anthropic, else mock", () => {
    expect(provider()).toBe("mock");
    process.env.ANTHROPIC_API_KEY = "a";
    expect(provider()).toBe("anthropic");
    process.env.OPENCODE_API_KEY = "o";
    expect(provider()).toBe("opencode");
  });

  it("sends plans requests to OpenCode Go with Haiku and Go's headers", async () => {
    process.env.OPENCODE_API_KEY = "test-opencode-key";
    const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
        // A minimal server-sent-events reply, as the streaming call expects.
        const events = [
          {
            type: "message_start",
            message: {
              id: "msg_1",
              type: "message",
              role: "assistant",
              model: "claude-haiku-5-5",
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 1, output_tokens: 0 },
            },
          },
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: JSON.stringify({ plans, notes: "estimates" }) } },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
          { type: "message_stop" },
        ];
        const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
        return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
      }),
    );

    const out = await generatePlans(input);
    expect(out).toHaveLength(3);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://opencode.ai/inference/go/anthropic/v1/messages");
    expect(calls[0].body.model).toBe("claude-haiku-5-5");
    expect(calls[0].body).not.toHaveProperty("fallbacks");
    expect(calls[0].body.stream).toBe(true);
    expect(calls[0].headers.get("x-api-key")).toBe("test-opencode-key");
    expect(calls[0].headers.get("authorization")).toBe("Bearer test-opencode-key");
    expect(calls[0].headers.get("x-opencode-session")).toBe("familytrip-abc");
    expect(calls[0].headers.get("user-agent")).toBe("familytrip/0.1");
  });

  it("returns null without a Google key", async () => {
    expect(await enrichPlans(plans, trip)).toBeNull();
  });

  it("looks up places and photos on Google, and travel on Transitous", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    const urls: string[] = [];
    const transitous: { url: URL; headers: Headers }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        urls.push(u);
        expect(u).not.toContain("test-google-key");
        if (u.startsWith("https://api.transitous.org/api/v5/plan")) {
          const headers = new Headers(init?.headers);
          expect(headers.get("X-Goog-Api-Key")).toBeNull(); // the Google key never leaves for Transitous
          transitous.push({ url: new URL(u), headers });
          return Response.json({
            itineraries: [{ duration: 900 }],
            direct: [
              { duration: 2820, legs: [{ mode: "WALK" }] },
              { duration: 480, legs: [{ mode: "CAR" }] },
            ],
          });
        }
        expect(new Headers(init?.headers).get("X-Goog-Api-Key")).toBe("test-google-key");
        if (u.endsWith("places:searchText")) {
          const q = JSON.parse(String(init?.body)).textQuery as string;
          if (q.startsWith("City park")) return Response.json({}); // not found
          return Response.json({
            places: [
              {
                id: q,
                displayName: { text: q.split(",")[0] },
                location: { latitude: 35, longitude: 135.7 },
                utcOffsetMinutes: 540,
                googleMapsUri: "https://maps.google.com/?cid=1",
                rating: 4.5,
                photos: [{ name: "places/p1/photos/ph1", authorAttributions: [{ displayName: "Ana" }] }],
                regularOpeningHours: {
                  periods: [{ open: { day: 1, hour: 10 }, close: { day: 1, hour: 12 } }],
                  weekdayDescriptions: ["Monday: 10:00 – 12:00", "Tuesday: Closed"],
                },
              },
            ],
          });
        }
        if (u.includes("/media?")) return Response.json({ photoUri: "https://lh3.googleusercontent.com/photo" });
        return new Response("nope", { status: 404 });
      }),
    );

    const live = await enrichPlans([plans[0]], trip);
    const stops = live![0].stops;
    expect(stops).toHaveLength(plans[0].stops.length);
    // Stop 0 (09:30–10:30) runs before the 10:00 opening; stop 1 (11:00–13:00) runs past noon.
    expect(stops[0].openStatus).toBe("partly");
    expect(stops[0].hoursText).toBe("Monday: 10:00 – 12:00");
    expect(stops[0].photoUri).toBe("https://lh3.googleusercontent.com/photo");
    expect(stops[0].photoAttribution).toBe("Ana");
    // Sample plan modes: walk, metro, walk, bus. The last stop isn't found, so it has no route.
    expect(stops.map((x) => x.routeMinutes)).toEqual([47, 15, 47, null]);
    expect(stops[3].found).toBe(false);
    expect(urls.some((u) => u.includes("places/p1/photos/ph1/media"))).toBe(true);

    expect(transitous).toHaveLength(3); // hotel→0, 0→1, 1→2
    // Leg into stop 1 leaves when stop 0 ends (10:30 Kyoto time = 01:30 UTC).
    expect(transitous[1].url.searchParams.get("time")).toBe("2026-11-02T01:30:00.000Z");
    expect(transitous[1].url.searchParams.get("fromPlace")).toBe("35,135.7");
    expect(transitous[1].url.searchParams.get("directModes")).toBe("WALK,CAR");
    expect(transitous[0].headers.get("User-Agent")).toMatch(/^familytrip\/0\.1/);
  });
});

describe("namesDiffer", () => {
  it("flags a different branch but not a renamed same place", async () => {
    const { namesDiffer } = await import("../components/PlanCard");
    expect(namesDiffer("Round1 Kyoto Station", "Round One Kyoto Kawaramachi", "Kyoto")).toBe(true);
    expect(namesDiffer("Hotel near Kyoto Station", "Hotel Granvia Kyoto", "Kyoto")).toBe(true);
    expect(namesDiffer("Kyoto Station Ramen Street", "Kyoto Ramen Koji", "Kyoto")).toBe(false);
    expect(namesDiffer("Arashiyama Bamboo Grove", "Arashiyama Bamboo Forest", "Kyoto")).toBe(false);
    expect(namesDiffer("Kyoto Aquarium", "Kyoto Aquarium", "Kyoto")).toBe(false);
  });
});

describe("namesDiffer with no match name", () => {
  it("doesn't flag when Google gave no name", async () => {
    const { namesDiffer } = await import("../components/PlanCard");
    expect(namesDiffer("Pastéis de Belém", "", "Lisbon")).toBe(false);
  });
});
