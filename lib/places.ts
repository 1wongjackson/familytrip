import type { DayPlan } from "./plan-schema";
import { departureIso, minusMinutes, travelMinutes, type LatLng } from "./transitous";
import type { OpenStatus, PlanLive, StopLive, Trip } from "./types";

// Checks each proposed stop: Google Places API (New) for the real place,
// photo and opening hours; Transitous for real travel time between stops.
// Every lookup is best-effort; a failure leaves that stop marked "not found"
// or keeps the model's travel estimate.

const PLACES_URL = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 10_000;

export function liveChecksEnabled(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

interface Period {
  open: { day: number; hour?: number; minute?: number };
  close?: { day: number; hour?: number; minute?: number };
}

interface Place {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: LatLng;
  utcOffsetMinutes?: number;
  googleMapsUri?: string;
  rating?: number;
  photos?: { name: string; authorAttributions?: { displayName?: string }[] }[];
  regularOpeningHours?: { periods?: Period[]; weekdayDescriptions?: string[] };
}

const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "utcOffsetMinutes",
  "googleMapsUri",
  "rating",
  "photos",
  "regularOpeningHours",
]
  .map((f) => `places.${f}`)
  .join(",");

// Day of week (0 = Sunday, as Google uses) for a YYYY-MM-DD date.
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

const WEEK = 7 * 24 * 60;

// Whether a visit from start to end (24h "HH:MM") on the given weekday falls
// inside the place's opening periods. Google omits zero-valued fields, so a
// missing hour or minute means 0, and a lone period with no close is 24/7.
export function checkOpen(periods: Period[] | undefined, weekday: number, start: string, end: string): OpenStatus {
  if (!periods || periods.length === 0) return "unknown";

  const v0 = weekday * 1440 + toMinutes(start);
  let v1 = weekday * 1440 + toMinutes(end);
  if (v1 <= v0) v1 += 1440;

  const dayStart = weekday * 1440;
  let overlaps = false;
  let openThatDay = false;
  for (const p of periods) {
    const o = p.open.day * 1440 + (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0);
    if (!p.close) return "open";
    let c = p.close.day * 1440 + (p.close.hour ?? 0) * 60 + (p.close.minute ?? 0);
    if (c <= o) c += WEEK; // wraps past Saturday night
    // Check the visit as-is and shifted a week, to catch periods that wrap.
    for (const shift of [0, WEEK]) {
      const a = v0 + shift;
      const b = v1 + shift;
      if (a >= o && b <= c) return "open";
      if (a < c && b > o) overlaps = true;
      if (dayStart + shift < c && dayStart + shift + 1440 > o) openThatDay = true;
    }
  }
  if (overlaps) return "partly";
  return openThatDay ? "outside" : "closed";
}

async function google<T>(url: string, init: RequestInit, fieldMask: string, errors: Set<string>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
        "X-Goog-FieldMask": fieldMask,
        ...init.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      errors.add(`${new URL(url).hostname} ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    errors.add(err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function searchPlace(query: string, errors: Set<string>): Promise<Place | null> {
  const data = await google<{ places?: Place[] }>(
    `${PLACES_URL}/places:searchText`,
    { method: "POST", body: JSON.stringify({ textQuery: query, pageSize: 1 }) },
    PLACE_FIELDS,
    errors,
  );
  return data?.places?.[0] ?? null;
}

// Resolves a photo to a short-lived image URL that carries no API key, so it
// is safe to hand to the family's phones.
async function photoUri(photoName: string, errors: Set<string>): Promise<string> {
  const data = await google<{ photoUri?: string }>(
    `${PLACES_URL}/${photoName}/media?maxWidthPx=640&skipHttpRedirect=true`,
    { method: "GET" },
    "photoUri",
    errors,
  );
  return data?.photoUri ?? "";
}

const notFound = (routeMinutes: number | null = null): StopLive => ({
  found: false,
  name: "",
  address: "",
  mapsUri: "",
  photoUri: "",
  photoAttribution: "",
  rating: null,
  openStatus: "unknown",
  hoursText: "",
  routeMinutes,
});

// Returns one PlanLive per plan, or null when no Google key is configured.
export async function enrichPlans(plans: DayPlan[], trip: Trip): Promise<PlanLive[] | null> {
  if (!liveChecksEnabled()) return null;

  const errors = new Set<string>();
  const cache = new Map<string, Promise<Place | null>>();
  const lookup = (query: string) => {
    if (!cache.has(query)) cache.set(query, searchPlace(query, errors));
    return cache.get(query)!;
  };

  const weekday = weekdayOf(trip.date);
  const hotel = trip.hotelArea ? await lookup(`${trip.hotelArea}, ${trip.destination}`) : null;

  const result = await Promise.all(
    plans.map(async (plan): Promise<PlanLive> => {
      const places = await Promise.all(plan.stops.map((s) => lookup(`${s.place}, ${s.area}, ${trip.destination}`)));
      const offset = [hotel, ...places].find((p) => p?.utcOffsetMinutes != null)?.utcOffsetMinutes;

      // One leg at a time per plan, to keep the load on Transitous light.
      const minutes: (number | null)[] = [];
      for (const [i, stop] of plan.stops.entries()) {
        const from = i === 0 ? hotel?.location : places[i - 1]?.location;
        const to = places[i]?.location;
        const leaveAt = i === 0 ? minusMinutes(stop.start, stop.getThere.minutes) : plan.stops[i - 1].end;
        minutes.push(
          from && to && offset != null
            ? await travelMinutes(from, to, stop.getThere.mode, departureIso(trip.date, leaveAt, offset), errors)
            : null,
        );
      }

      const stops = await Promise.all(
        plan.stops.map(async (stop, i): Promise<StopLive> => {
          const place = places[i];
          if (!place) return notFound(minutes[i]);

          const photo = place.photos?.[0];
          return {
            found: true,
            name: place.displayName?.text ?? stop.place,
            address: place.formattedAddress ?? "",
            mapsUri: place.googleMapsUri ?? "",
            photoUri: photo ? await photoUri(photo.name, errors) : "",
            photoAttribution: photo?.authorAttributions?.[0]?.displayName ?? "",
            rating: place.rating ?? null,
            openStatus: checkOpen(place.regularOpeningHours?.periods, weekday, stop.start, stop.end),
            // weekdayDescriptions starts on Monday.
            hoursText: place.regularOpeningHours?.weekdayDescriptions?.[(weekday + 6) % 7] ?? "",
            routeMinutes: minutes[i],
          };
        }),
      );
      return { checkedAt: Date.now(), stops };
    }),
  );

  if (errors.size > 0) console.warn("Live checks failed:", [...errors].join("; "));
  return result;
}
