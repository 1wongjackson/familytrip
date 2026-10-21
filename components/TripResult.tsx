"use client";

import Link from "next/link";
import { PlanCard } from "./PlanCard";
import { TripHero } from "./TripHero";
import { Banner, Card } from "./ui";
import { useTrip } from "./use-trip";

export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ${hours % 24} h`;
}

export function TripResult({ slug }: { slug: string }) {
  const { state, notFound } = useTrip(slug);

  if (notFound) return <Banner tone="warn">This trip link doesn&apos;t exist.</Banner>;
  if (!state) return <p className="text-stone-500">Loading…</p>;

  const plan = state.plans.find((p) => p.id === state.trip.agreedPlanId);
  if (!plan || !state.trip.agreedAt) {
    return (
      <Banner>
        You haven&apos;t settled on a plan yet.{" "}
        <Link href={`/t/${slug}/plans`} className="font-medium underline">
          Back to voting
        </Link>
      </Banner>
    );
  }

  const elapsed = state.trip.agreedAt - state.trip.createdAt;
  const plansSeen = state.plans.filter((p) => p.round <= plan.round).length;

  return (
    <>
      <TripHero state={state} title={`Your day in ${state.trip.destination}`} subtitle="🎉 Everyone agreed" />

      <Card>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-xs text-stone-500">Time to agree</dt>
            <dd className="text-lg font-semibold">{formatDuration(elapsed)}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Rounds</dt>
            <dd className="text-lg font-semibold">{plan.round}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Plans seen</dt>
            <dd className="text-lg font-semibold">{plansSeen}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-stone-500">
          Measured from when the trip was created to when the family confirmed this plan. Before this app, it took about 3 days.
        </p>
      </Card>

      <PlanCard plan={plan.data} live={plan.live} destination={state.trip.destination} highlight />
    </>
  );
}
