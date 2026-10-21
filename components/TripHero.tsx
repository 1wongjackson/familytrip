import Link from "next/link";
import type { ReactNode } from "react";
import type { TripState } from "@/lib/types";

// Trip banner: the first real place photo from the plans as a cover, or a
// sunrise gradient before any plans exist.
export function TripHero({ state, title, subtitle, back }: { state: TripState; title?: ReactNode; subtitle?: ReactNode; back?: string }) {
  const cover = state.plans.flatMap((p) => p.live?.stops ?? []).find((s) => s.photoUri);
  const when = state.trip.date
    ? new Date(`${state.trip.date}T00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    : "";

  return (
    <header className="relative isolate overflow-hidden rounded-3xl shadow-[0_12px_32px_-12px_rgba(15,60,70,0.45)]">
      {cover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived external Google photo URL */}
          <img src={cover.photoUri} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
          {cover.photoAttribution && (
            <span className="absolute right-2 top-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/90">Photo: {cover.photoAttribution}</span>
          )}
        </>
      ) : (
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-teal-700 via-teal-600 to-amber-500" />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/30 to-black/5" />

      <div className="flex min-h-44 flex-col justify-end p-5 text-white">
        {back && (
          <Link href={back} className="mb-auto inline-flex w-fit items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-sm backdrop-blur hover:bg-white/30">
            ← {state.trip.destination}
          </Link>
        )}
        <p className="text-sm font-medium uppercase tracking-wider text-white/80">{subtitle ?? when}</p>
        <h1 className="text-3xl font-bold tracking-tight drop-shadow-sm">{title ?? state.trip.destination}</h1>
        {!title && state.trip.hotelArea && <p className="text-white/85">Staying {state.trip.hotelArea}</p>}
      </div>
    </header>
  );
}
