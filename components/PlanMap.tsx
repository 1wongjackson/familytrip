"use client";

import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import type * as Leaflet from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { planConflicts } from "@/lib/conflicts";
import { estimateLeg, haversineKm } from "@/lib/reorder";
import type { LatLng, StoredPlan, TripState } from "@/lib/types";
import { postJson, useMe, useTrip } from "./use-trip";

// Command-centre view of one day plan: a dark, simplified map with the route,
// distance rings around the hotel, and an itinerary rail you drag to reorder.

const RINGS_KM = [1, 2, 5];
// Free, keyless dark vector basemap from OpenFreeMap (OpenMapTiles schema).
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
// Base layers hidden to keep the map simple: only water, parks, roads, rail and place names remain.
const HIDDEN_LAYERS = /^(building|road_oneway|highway_path|aeroway-taxiway|road_pier|road_area_pier)/;
const modeIcon: Record<string, string> = {
  walk: "🚶",
  metro: "🚇",
  bus: "🚌",
  tram: "🚊",
  train: "🚆",
  taxi: "🚕",
  car: "🚗",
  ferry: "⛴️",
  other: "➡️",
};

interface Leg {
  km: number | null;
  minutes: number;
  mode: string;
  checked: boolean; // real route rather than an estimate
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// Legs for the stops in `order`, using saved travel where the pair is
// unchanged and a distance estimate where the drag created a new pair.
function legsFor(plan: StoredPlan, order: number[]): Leg[] {
  const live = plan.live;
  return order.map((orig, k) => {
    const stop = plan.data.stops[orig];
    const from = k === 0 ? live?.hotel?.location : live?.stops[order[k - 1]]?.location;
    const to = live?.stops[orig]?.location;
    const km = from && to ? haversineKm(from, to) : null;
    const unchanged = (k === 0 ? -1 : order[k - 1]) === orig - 1;
    if (unchanged) {
      const real = live?.stops[orig]?.routeMinutes;
      return { km, minutes: real ?? stop.getThere.minutes, mode: stop.getThere.mode, checked: real != null };
    }
    if (km == null) return { km, minutes: stop.getThere.minutes, mode: stop.getThere.mode, checked: false };
    const est = estimateLeg(km, stop.getThere.mode);
    return { km, minutes: est.minutes, mode: est.mode, checked: false };
  });
}

export function PlanMap({ slug, planId }: { slug: string; planId: number }) {
  const { state, notFound, refresh } = useTrip(slug);
  const { meId } = useMe(slug);
  const plan = state?.plans.find((p) => p.id === planId);

  if (notFound) return <p className="text-stone-500">This trip link doesn&apos;t exist.</p>;
  if (!state) return <p className="text-stone-500">Loading map…</p>;
  if (!plan) return <p className="text-stone-500">That plan doesn&apos;t exist.</p>;

  const hasMap = !!plan.live && plan.live.stops.some((s) => s.location);
  if (!hasMap) {
    return (
      <div className="space-y-3 rounded-3xl bg-slate-950 p-6 text-slate-100">
        <p className="font-mono text-xs uppercase tracking-widest text-teal-300">No map data</p>
        <p>This plan was made before maps were added. Make new plans to see the day on a map.</p>
        <Link href={`/t/${slug}/plans`} className="inline-block rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
          ← Back to plans
        </Link>
      </div>
    );
  }

  // Remount when the saved order changes so local drag state starts fresh.
  const key = `${plan.id}:${plan.data.stops.map((s) => s.place).join("|")}`;
  return <CommandCentre key={key} slug={slug} state={state} plan={plan} meId={meId} refresh={refresh} />;
}

function CommandCentre({
  slug,
  state,
  plan,
  meId,
  refresh,
}: {
  slug: string;
  state: TripState;
  plan: StoredPlan;
  meId: number | null;
  refresh: () => Promise<void>;
}) {
  const n = plan.data.stops.length;
  const identity = useMemo(() => Array.from({ length: n }, (_, i) => i), [n]);
  const [order, setOrder] = useState(identity);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const me = state.members.find((m) => m.id === meId);

  const legs = useMemo(() => legsFor(plan, order), [plan, order]);
  const dirty = order.some((o, k) => o !== k);

  // Times shown in the rail: keep each stop's length, add travel between.
  const times = useMemo(() => {
    const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    const fmt = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const out: { start: string; end: string }[] = [];
    let t = toMin(plan.data.stops[0].start);
    for (const [k, orig] of order.entries()) {
      const s = plan.data.stops[orig];
      if (k > 0) t += legs[k].minutes;
      const start = t;
      t += (toMin(s.end) - toMin(s.start) + 1440) % 1440;
      out.push({ start: fmt(start), end: fmt(t) });
    }
    return out;
  }, [order, legs, plan]);

  const totalKm = legs.reduce((sum, l) => sum + (l.km ?? 0), 0);
  const totalTravel = legs.reduce((sum, l) => sum + l.minutes, 0);
  const conflicts = planConflicts(plan, state.members, state.votes, state.answers);

  async function save(next: number[]) {
    if (!me || next.every((o, k) => o === k)) return;
    setSaving(true);
    setError("");
    const res = await postJson(`/api/trips/${slug}/plans/${plan.id}/order`, { memberId: me.id, order: next });
    if (!res.ok) {
      setError(res.error ?? "Couldn't save the new order.");
      setOrder(identity);
    }
    await refresh();
    setSaving(false);
  }

  const backHref = state.trip.agreedPlanId === plan.id ? `/t/${slug}/result` : `/t/${slug}/plans`;

  return (
    <div className="ft-cc fixed inset-0 z-40 flex flex-col bg-[#05080f] font-mono text-slate-100">
      <header className="z-[1000] flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-teal-400/20 bg-[#070c16]/95 px-3 py-2 backdrop-blur">
        <Link href={backHref} className="rounded-md border border-teal-400/30 px-2 py-1 text-xs text-teal-200 hover:bg-teal-400/10">
          ← Back
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-teal-300/80">
            {state.trip.destination} · Mission plan
          </p>
          <h1 className="truncate font-sans text-sm font-semibold">{plan.data.title}</h1>
        </div>
        <dl className="flex w-full gap-1.5 text-center sm:w-auto">
          <Stat label="Stops" value={String(n)} />
          <Stat label="Dist" value={`${totalKm.toFixed(1)} km`} />
          <Stat label="Travel" value={`${totalTravel} min`} />
          <Stat label="Window" value={`${times[0].start}–${times[n - 1].end}`} />
          <Stat label="Alerts" value={String(conflicts.length)} alert={conflicts.length > 0} />
        </dl>
      </header>

      <div className="relative flex-1 md:flex">
        <MapCanvas plan={plan} order={order} legs={legs} selected={selected} onSelect={setSelected} />
        <Rail
          plan={plan}
          order={order}
          legs={legs}
          times={times}
          selected={selected}
          onSelect={setSelected}
          canEdit={!!me}
          onPreview={setOrder}
          onDrop={save}
          status={
            error ||
            (saving
              ? "Saving and checking real travel times…"
              : dirty
                ? "Drop to save"
                : plan.live?.reorderedBy
                  ? `Rearranged by ${plan.live.reorderedBy}`
                  : me
                    ? "Drag ⠿ to rearrange the day"
                    : "")
          }
          slug={slug}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`flex-1 rounded-md border px-2 py-1 sm:flex-none ${alert ? "border-rose-400/40 bg-rose-500/10" : "border-teal-400/20 bg-teal-400/5"}`}>
      <dt className={`text-[9px] uppercase tracking-[0.18em] ${alert ? "text-rose-300" : "text-teal-300/70"}`}>{label}</dt>
      <dd className={`whitespace-nowrap text-xs font-semibold ${alert ? "text-rose-100" : "text-slate-100"}`}>{value}</dd>
    </div>
  );
}

function MapCanvas({
  plan,
  order,
  legs,
  selected,
  onSelect,
}: {
  plan: StoredPlan;
  order: number[];
  legs: Leg[];
  selected: number | null;
  onSelect: (orig: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const overlay = useRef<Leaflet.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(0); // redraw labels after zooming
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once. Leaflet touches `window`, so it loads in the browser only.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([import("leaflet"), import("@maplibre/maplibre-gl-leaflet")]).then(([mod, bridge]) => {
      const leaflet = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      if (cancelled || !el.current || map.current) return;
      L.current = leaflet;
      const m = leaflet.map(el.current, { zoomControl: false, attributionControl: true, maxZoom: 18 });
      // Leaflet only adds layers once the map has a view, so fit the day first.
      const pts = [plan.live?.hotel?.location, ...(plan.live?.stops.map((s) => s.location) ?? [])].filter((p): p is LatLng => !!p);
      // On phones the itinerary rail covers the bottom of the map.
      const railCover = window.innerWidth < 768 ? Math.round(window.innerHeight * 0.42) : 30;
      m.fitBounds(leaflet.latLngBounds(pts.map((p) => [p.latitude, p.longitude])), {
        paddingTopLeft: [30, 30],
        paddingBottomRight: [30, railCover],
        maxZoom: 15,
      });
      const base = bridge.maplibreGL({ style: BASEMAP_STYLE }).addTo(m);
      m.attributionControl.addAttribution(
        '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      );
      const gl = base.getMaplibreMap();
      gl.on("style.load", () => {
        for (const layer of gl.getStyle().layers ?? []) {
          if (HIDDEN_LAYERS.test(layer.id)) gl.setLayoutProperty(layer.id, "visibility", "none");
        }
      });
      leaflet.control.zoom({ position: "topright" }).addTo(m);
      leaflet.control.scale({ metric: true, imperial: false, position: "topleft", maxWidth: 140 }).addTo(m);
      overlay.current = leaflet.layerGroup().addTo(m);
      m.on("zoomend", () => setZoom(m.getZoom()));
      map.current = m;

      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // The map is created once per mount; later changes redraw the overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw route, rings and markers whenever the order or selection changes.
  useEffect(() => {
    const leaflet = L.current;
    const group = overlay.current;
    if (!ready || !leaflet || !group) return;
    group.clearLayers();
    const ll = (p: LatLng): Leaflet.LatLngTuple => [p.latitude, p.longitude];
    const hotel = plan.live?.hotel?.location;

    if (hotel) {
      for (const r of RINGS_KM) {
        leaflet.circle(ll(hotel), { radius: r * 1000, color: "#5eead4", weight: 1, opacity: 0.35, fill: false, dashArray: "2 6", interactive: false }).addTo(group);
        leaflet
          .marker([hotel.latitude + r / 111.2, hotel.longitude], {
            icon: leaflet.divIcon({ className: "", html: `<span class="ft-ring-label">${r} km</span>`, iconSize: [40, 14], iconAnchor: [20, 7] }),
            interactive: false,
          })
          .addTo(group);
      }
      leaflet
        .marker(ll(hotel), {
          icon: leaflet.divIcon({ className: "", html: `<div class="ft-hq" title="Hotel"><span>HQ</span></div>`, iconSize: [34, 34], iconAnchor: [17, 17] }),
          zIndexOffset: 500,
        })
        .addTo(group);
    }

    const path = [hotel, ...order.map((o) => plan.live?.stops[o]?.location)].filter((p): p is LatLng => !!p).map(ll);
    leaflet.polyline(path, { color: "#2dd4bf", weight: 10, opacity: 0.12, interactive: false }).addTo(group);
    leaflet.polyline(path, { color: "#5eead4", weight: 2.5, opacity: 0.95, dashArray: "8 7", className: "ft-route", interactive: false }).addTo(group);

    order.forEach((orig, k) => {
      const at = plan.live?.stops[orig]?.location;
      if (!at) return;
      const from = k === 0 ? hotel : plan.live?.stops[order[k - 1]]?.location;
      // Skip the label when the leg is too short on screen to fit it.
      const tooShort =
        from && map.current ? map.current.latLngToContainerPoint(ll(from)).distanceTo(map.current.latLngToContainerPoint(ll(at))) < 120 : true;
      if (from && !tooShort) {
        const leg = legs[k];
        const mid: Leaflet.LatLngTuple = [(from.latitude + at.latitude) / 2, (from.longitude + at.longitude) / 2];
        const label = `${leg.km != null ? `${leg.km.toFixed(1)} km · ` : ""}${leg.checked ? "" : "~"}${leg.minutes} min`;
        leaflet
          .marker(mid, {
            icon: leaflet.divIcon({ className: "", html: `<span class="ft-leg">${modeIcon[leg.mode] ?? ""} ${label}</span>`, iconSize: [110, 18], iconAnchor: [55, 9] }),
            interactive: false,
          })
          .addTo(group);
      }
      const active = selected === orig;
      leaflet
        .marker(ll(at), {
          icon: leaflet.divIcon({ className: "", html: `<div class="ft-pin${active ? " ft-pin-active" : ""}">${k + 1}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
          title: plan.data.stops[orig].place,
          zIndexOffset: active ? 1000 : 600,
        })
        .on("click", () => onSelectRef.current(orig))
        .addTo(group);
    });
  }, [ready, plan, order, legs, selected, zoom]);

  useEffect(() => {
    const at = selected != null ? plan.live?.stops[selected]?.location : null;
    if (at && map.current) map.current.panTo([at.latitude, at.longitude], { animate: true });
  }, [selected, plan]);

  return <div ref={el} className="ft-map absolute inset-0 md:relative md:flex-1" aria-label="Map of the day's route" />;
}

function Rail({
  plan,
  order,
  legs,
  times,
  selected,
  onSelect,
  canEdit,
  onPreview,
  onDrop,
  status,
  slug,
}: {
  plan: StoredPlan;
  order: number[];
  legs: Leg[];
  times: { start: string; end: string }[];
  selected: number | null;
  onSelect: (orig: number) => void;
  canEdit: boolean;
  onPreview: (order: number[]) => void;
  onDrop: (order: number[]) => void;
  status: string;
  slug: string;
}) {
  const cards = useRef<(HTMLLIElement | null)[]>([]);
  const [dragging, setDragging] = useState<number | null>(null); // original index being dragged
  const live = useRef(order);
  useEffect(() => {
    live.current = order;
  }, [order]);

  function onPointerDown(e: React.PointerEvent, orig: number) {
    if (!canEdit) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(orig);
    onSelect(orig);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragging == null) return;
    const current = live.current;
    const from = current.indexOf(dragging);
    // Target slot: how many other cards sit above the pointer.
    let to = 0;
    current.forEach((orig, k) => {
      const rect = cards.current[k]?.getBoundingClientRect();
      if (orig !== dragging && rect && e.clientY > rect.top + rect.height / 2) to++;
    });
    if (to !== from) {
      const next = move(current, from, to);
      live.current = next;
      onPreview(next);
    }
  }

  function onPointerUp() {
    if (dragging == null) return;
    setDragging(null);
    onDrop(live.current);
  }

  function nudge(orig: number, by: number) {
    const from = order.indexOf(orig);
    const to = Math.max(0, Math.min(order.length - 1, from + by));
    if (to === from) return;
    const next = move(order, from, to);
    onPreview(next);
    onDrop(next);
  }

  return (
    <aside className="absolute inset-x-0 bottom-0 z-[1000] max-h-[46%] overflow-hidden rounded-t-2xl border-t border-teal-400/25 bg-[#070c16]/92 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] backdrop-blur md:static md:max-h-none md:w-[340px] md:rounded-none md:border-l md:border-t-0">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-teal-300/80">Itinerary</p>
        <p className={`text-[11px] ${status.startsWith("Couldn") || status.startsWith("The ") ? "text-rose-300" : "text-slate-400"}`}>
          {status}
          {!canEdit && (
            <>
              {" "}
              <Link href={`/t/${slug}`} className="text-teal-300 underline">
                Pick your name
              </Link>{" "}
              to rearrange.
            </>
          )}
        </p>
      </div>
      <ol className="max-h-[calc(46vh-40px)] space-y-1.5 overflow-y-auto p-2 md:max-h-[calc(100vh-110px)]">
        {order.map((orig, k) => {
          const s = plan.data.stops[orig];
          const leg = legs[k];
          const l = plan.live?.stops[orig];
          const isDragging = dragging === orig;
          const closed = l && (l.openStatus === "closed" || l.openStatus === "outside" || l.openStatus === "partly");
          return (
            <li
              key={orig}
              ref={(node) => {
                cards.current[k] = node;
              }}
              onClick={() => onSelect(orig)}
              className={`flex items-stretch gap-2 rounded-xl border p-2 transition-colors ${
                isDragging
                  ? "scale-[1.02] border-teal-300 bg-teal-400/15 shadow-[0_0_24px_rgba(45,212,191,0.35)]"
                  : selected === orig
                    ? "border-teal-400/60 bg-teal-400/10"
                    : "border-white/10 bg-white/[0.03] hover:border-teal-400/30"
              }`}
            >
              <div className="grid size-7 shrink-0 place-items-center self-center rounded-full border border-teal-300/70 bg-teal-400/15 text-xs font-bold text-teal-100 shadow-[0_0_12px_rgba(45,212,191,0.45)]">
                {k + 1}
              </div>
              <div className="min-w-0 flex-1 font-sans">
                <p className="truncate text-sm font-medium">{s.place}</p>
                <p className="font-mono text-[11px] text-slate-400">
                  {times[k].start}–{times[k].end} · {modeIcon[leg.mode] ?? ""} {leg.checked ? "" : "~"}
                  {leg.minutes} min{leg.km != null ? ` · ${leg.km.toFixed(1)} km` : ""}
                </p>
                {closed && <p className="font-mono text-[10px] uppercase tracking-wider text-rose-300">⚠ check opening hours</p>}
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  <div className="hidden flex-col sm:flex">
                    <button aria-label={`Move ${s.place} earlier`} className="px-1 text-[10px] text-slate-400 hover:text-teal-200" onClick={(e) => (e.stopPropagation(), nudge(orig, -1))}>
                      ▲
                    </button>
                    <button aria-label={`Move ${s.place} later`} className="px-1 text-[10px] text-slate-400 hover:text-teal-200" onClick={(e) => (e.stopPropagation(), nudge(orig, 1))}>
                      ▼
                    </button>
                  </div>
                  <button
                    aria-label={`Drag to move ${s.place}`}
                    className="cursor-grab touch-none select-none rounded-md px-2 py-2 text-lg leading-none text-teal-200/80 hover:bg-teal-400/10 active:cursor-grabbing"
                    onPointerDown={(e) => onPointerDown(e, orig)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onClick={(e) => e.stopPropagation()}
                  >
                    ⠿
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
