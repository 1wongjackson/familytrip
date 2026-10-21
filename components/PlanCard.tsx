import Link from "next/link";
import type { ReactNode } from "react";
import type { DayPlan } from "@/lib/plan-schema";
import type { OpenStatus, PlanConflict, PlanLive } from "@/lib/types";
import { TRANSITOUS_SOURCES_URL } from "@/lib/transitous";
import { Card, Chip } from "./ui";

const modeLabel: Record<string, string> = {
  walk: "🚶 Walk",
  metro: "🚇 Metro",
  bus: "🚌 Bus",
  tram: "🚊 Tram",
  train: "🚆 Train",
  taxi: "🚕 Taxi",
  car: "🚗 Car",
  ferry: "⛴️ Ferry",
  other: "➡️",
};

const fitTone = { great: "good", ok: "neutral", stretch: "warn" } as const;

const openChip: Record<OpenStatus, { tone: "good" | "warn" | "bad" | "neutral"; label: string }> = {
  open: { tone: "good", label: "Open then" },
  partly: { tone: "warn", label: "Open part of the visit" },
  closed: { tone: "bad", label: "Closed that day" },
  outside: { tone: "bad", label: "Not open at that time" },
  unknown: { tone: "neutral", label: "Hours unknown" },
};

const conflictIcon = { vetoed: "✋", constraint: "⚠️", closed: "🕒", travel: "🚌" };

// Google's text search can match a different branch than the one planned
// (e.g. "Round1 Kyoto Station" → "Round One Kyoto Kawaramachi").
// Flags only when the names share no meaningful word.
const GENERIC = new Set(["the", "and", "shop", "store", "street", "station", "main", "near", "hotel", "park"]);

export function namesDiffer(planned: string, found: string, destination: string): boolean {
  const skip = new Set([...GENERIC, ...destination.toLowerCase().split(/\W+/)]);
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !skip.has(w)),
    );
  if (!found.trim()) return false;
  const a = words(planned);
  const b = words(found);
  if (a.size === 0 || b.size === 0) return a.size !== b.size;
  return ![...a].some((w) => b.has(w));
}

function mapsLink(place: string, destination: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place}, ${destination}`)}`;
}

export function PlanCard({
  plan,
  destination,
  live = null,
  conflicts = [],
  highlight = false,
  footer,
  mapHref,
}: {
  plan: DayPlan;
  live?: PlanLive | null;
  destination: string;
  conflicts?: PlanConflict[];
  highlight?: boolean;
  footer?: ReactNode;
  mapHref?: string;
}) {
  const first = plan.stops[0];
  const last = plan.stops[plan.stops.length - 1];
  const travelMinutes = plan.stops.reduce((sum, s, i) => sum + (live?.stops[i]?.routeMinutes ?? s.getThere.minutes), 0);

  return (
    <Card className={highlight ? "ring-2 ring-teal-600" : conflicts.length > 0 ? "ring-2 ring-rose-300 dark:ring-rose-800" : ""}>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          <Chip>{plan.style}</Chip>
          <span>
            {first?.start}–{last?.end} · ~{plan.totalHours}h · ~{travelMinutes} min travel
          </span>
          <span title={plan.costNote}>{plan.costBand}</span>
          {live?.reorderedBy && <Chip tone="warn">Rearranged by {live.reorderedBy}</Chip>}
          {mapHref && live?.stops.some((s) => s.location) && (
            <Link
              href={mapHref}
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-teal-200 shadow-[0_0_14px_rgba(45,212,191,0.35)] hover:bg-slate-800"
            >
              🛰 Map
            </Link>
          )}
        </div>
        <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-50">{plan.title}</h3>
        <p className="text-stone-700 dark:text-stone-300">{plan.pitch}</p>
      </header>

      {conflicts.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">
          {conflicts.map((c, i) => (
            <li key={i}>
              <span className="font-medium">
                {conflictIcon[c.kind]} {c.kind === "vetoed" ? `${c.memberName} said no` : c.memberName}
              </span>
              {": "}
              {c.detail}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {plan.fitsMembers.map((f) => (
          <span key={f.memberName} title={f.reason}>
            <Chip tone={fitTone[f.fit]}>
              {f.memberName}: {f.fit}
            </Chip>
          </span>
        ))}
      </div>

      <ol className="mt-4 space-y-0">
        {plan.stops.map((s, i) => {
          const l = live?.stops[i];
          return (
            <li key={i}>
              <div className="ml-14 border-l-2 border-dashed border-stone-200 py-1.5 pl-4 text-xs text-stone-500 dark:border-stone-700">
                {modeLabel[s.getThere.mode] ?? s.getThere.mode} ·{" "}
                {l?.routeMinutes != null ? (
                  <span title={`Estimated ${s.getThere.minutes} min`}>
                    {l.routeMinutes} min <span className="text-teal-700 dark:text-teal-400">(Transitous)</span>
                  </span>
                ) : (
                  `~${s.getThere.minutes} min`
                )}
                {s.getThere.note ? ` · ${s.getThere.note}` : ""}
              </div>
              <div className="flex gap-3">
                <div className="w-11 shrink-0 pt-0.5 text-right font-mono text-sm text-stone-500">{s.start}</div>
                <div className="min-w-0 flex-1 overflow-hidden rounded-xl bg-stone-50 dark:bg-stone-800/60">
                  {l?.photoUri && (
                    <figure className="relative">
                      {/* Google photo URLs are short-lived and external, so a plain img is simplest. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.photoUri} alt={l.name || s.place} loading="lazy" className="aspect-[16/9] w-full object-cover" />
                      {l.photoAttribution && (
                        <figcaption className="absolute bottom-0 right-0 bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                          Photo: {l.photoAttribution}
                        </figcaption>
                      )}
                    </figure>
                  )}
                  <div className="p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <a
                        href={l?.mapsUri || mapsLink(s.place, destination)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-stone-900 underline decoration-stone-300 underline-offset-2 hover:decoration-teal-600 dark:text-stone-100"
                      >
                        {s.place}
                      </a>
                      <span className="shrink-0 text-xs text-stone-500">until {s.end}</span>
                    </div>
                    <p className="text-xs text-stone-500">
                      {s.area}
                      {l?.rating != null && ` · ★ ${l.rating.toFixed(1)}`}
                    </p>
                    {l?.found && namesDiffer(s.place, l.name, destination) && (
                      <p className="text-xs text-stone-500">Google Maps found: {l.name}. Check it&apos;s the right one.</p>
                    )}
                    {l?.found && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Chip tone={openChip[l.openStatus].tone}>{openChip[l.openStatus].label}</Chip>
                        {l.hoursText && <span className="text-xs text-stone-500">{l.hoursText}</span>}
                      </div>
                    )}
                    <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">{s.why}</p>
                    {s.food && <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">🍽️ {s.food}</p>}
                    <p className="mt-1 text-sm italic text-stone-500">💡 {s.trivia}</p>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {plan.tradeoffs.length > 0 && (
        <div className="mt-4 text-sm text-stone-600 dark:text-stone-400">
          <p className="font-medium text-stone-800 dark:text-stone-200">Trade-offs</p>
          <ul className="list-disc pl-5">
            {plan.tradeoffs.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {live ? (
        <p className="mt-2 text-xs text-stone-500">
          Checked when the plan was made: places and opening hours from Google Maps; travel times from{" "}
          <a href={TRANSITOUS_SOURCES_URL} target="_blank" rel="noreferrer" className="underline">
            Transitous
          </a>{" "}
          (© OpenStreetMap contributors). Weather and traffic on the day aren&apos;t checked.
        </p>
      ) : (
        <p className="mt-2 text-xs text-stone-500">Times and travel are estimates. Check opening hours before you go.</p>
      )}

      {footer && <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">{footer}</div>}
    </Card>
  );
}
