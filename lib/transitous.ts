import type { TRANSPORT_MODES } from "./plan-schema";
import type { LatLng } from "./types";

// Real travel times from Transitous (https://transitous.org), a free,
// community-run journey planner over open transit data and OpenStreetMap.
// No key. Its usage policy asks for light, non-commercial use and an app
// User-Agent with contact details; set FAMILYTRIP_CONTACT to yours.

const PLAN_URL = "https://api.transitous.org/api/v5/plan";
const TIMEOUT_MS = 15_000;

export const TRANSITOUS_SOURCES_URL = "https://transitous.org/sources/";

type TransportMode = (typeof TRANSPORT_MODES)[number];

interface PlanResponse {
  itineraries?: { duration: number }[];
  direct?: { duration: number; legs: { mode: string }[] }[];
}

export function userAgent(): string {
  const contact = process.env.FAMILYTRIP_CONTACT?.trim();
  return `familytrip/0.1 (family trip planner prototype${contact ? `; ${contact}` : ""})`;
}

// Local wall-clock time on the trip date, as an absolute ISO time, using the
// destination's UTC offset from Google Places (e.g. +540 for Japan).
export function departureIso(date: string, hhmm: string, utcOffsetMinutes: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const utc = Date.UTC(y, (mo ?? 1) - 1, d ?? 1, h || 0, mi || 0) - utcOffsetMinutes * 60_000;
  return new Date(utc).toISOString();
}

// Clock time `minutes` before hhmm, for the leg into the first stop.
export function minusMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = ((((h || 0) * 60 + (m || 0) - minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Walking and taxi legs use the direct walk/car route; everything else uses
// the fastest public-transport itinerary.
export function pickMinutes(res: PlanResponse, mode: TransportMode): number | null {
  const direct = (m: string) => res.direct?.find((d) => d.legs.length > 0 && d.legs.every((l) => l.mode === m))?.duration;
  let seconds: number | undefined;
  if (mode === "walk") seconds = direct("WALK");
  else if (mode === "taxi" || mode === "car") seconds = direct("CAR");
  else {
    const durations = (res.itineraries ?? []).map((i) => i.duration);
    seconds = durations.length > 0 ? Math.min(...durations) : undefined;
  }
  return seconds != null && Number.isFinite(seconds) ? Math.max(1, Math.round(seconds / 60)) : null;
}

export async function travelMinutes(
  from: LatLng,
  to: LatLng,
  mode: TransportMode,
  departAt: string,
  errors: Set<string>,
): Promise<number | null> {
  const params = new URLSearchParams({
    fromPlace: `${from.latitude},${from.longitude}`,
    toPlace: `${to.latitude},${to.longitude}`,
    time: departAt,
    directModes: "WALK,CAR",
    maxDirectTime: "7200",
  });
  try {
    const res = await fetch(`${PLAN_URL}?${params}`, {
      headers: { "User-Agent": userAgent(), Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      errors.add(`transitous ${res.status}`);
      return null;
    }
    return pickMinutes((await res.json()) as PlanResponse, mode);
  } catch (err) {
    errors.add(`transitous ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
