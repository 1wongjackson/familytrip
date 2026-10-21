"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { roundPlans } from "@/lib/conflicts";
import type { Member, StoredPlan, TripState, Vote, VoteChoice } from "@/lib/types";
import { PlanCard } from "./PlanCard";
import { TripHero } from "./TripHero";
import { Banner, Button, Card } from "./ui";
import { postJson, useMe, useTrip } from "./use-trip";

const choices: { value: VoteChoice; label: string }[] = [
  { value: "love", label: "😍 Love it" },
  { value: "ok", label: "🙂 OK" },
  { value: "no", label: "✋ No" },
];

export function PlansVote({ slug }: { slug: string }) {
  const router = useRouter();
  const { state, notFound, refresh } = useTrip(slug);
  const { meId, loaded } = useMe(slug);

  // When anyone settles the trip, every phone moves to the result.
  const agreed = !!state?.trip.agreedPlanId;
  useEffect(() => {
    if (agreed) router.push(`/t/${slug}/result`);
  }, [agreed, router, slug]);

  if (notFound) return <Banner tone="warn">This trip link doesn&apos;t exist.</Banner>;
  if (!state || !loaded) return <p className="text-stone-500">Loading plans…</p>;

  const me = state.members.find((m) => m.id === meId);
  if (!me) {
    return (
      <Banner>
        Pick who you are first.{" "}
        <Link href={`/t/${slug}`} className="font-medium underline">
          Back to the trip
        </Link>
      </Banner>
    );
  }

  const plans = roundPlans(state.plans, state.currentRound);
  if (plans.length === 0) {
    return (
      <Banner>
        No plans yet.{" "}
        <Link href={`/t/${slug}`} className="font-medium underline">
          Back to the trip
        </Link>
      </Banner>
    );
  }

  return (
    <>
      <TripHero
        state={state}
        back={`/t/${slug}`}
        subtitle={state.currentRound > 1 ? `Round ${state.currentRound}` : "Vote on all three"}
        title="Pick a day"
      />
      <p className="px-1 text-sm text-stone-600 dark:text-stone-400">A single &quot;no&quot; rules a plan out.</p>

      {state.mock && <Banner tone="warn">Demo mode: these are sample plans, not made for your family.</Banner>}
      <VoteStatus state={state} plans={plans} />

      {plans.map((p) => (
        <PlanCard
          key={p.id}
          plan={p.data}
          live={p.live}
          destination={state.trip.destination}
          conflicts={state.conflicts[p.id] ?? []}
          highlight={state.candidatePlanId === p.id}
          footer={<VoteBox slug={slug} me={me} plan={p} state={state} onVoted={refresh} />}
        />
      ))}

      <Outcome slug={slug} state={state} plans={plans} refresh={refresh} />
    </>
  );
}

function VoteStatus({ state, plans }: { state: TripState; plans: StoredPlan[] }) {
  if (state.waitingOnVotes.length > 0) {
    return (
      <Banner>
        Waiting on <span className="font-medium">{state.waitingOnVotes.join(", ")}</span> to vote on every plan.
        {state.waitingOnVotes.length < state.members.length && " Give them a nudge!"}
      </Banner>
    );
  }
  const vetoed = plans.filter((p) => (state.conflicts[p.id] ?? []).some((c) => c.kind === "vetoed")).length;
  return <Banner tone="good">Everyone has voted. {vetoed > 0 && `${vetoed} of ${plans.length} plans got a no.`}</Banner>;
}

function VoteBox({ slug, me, plan, state, onVoted }: { slug: string; me: Member; plan: StoredPlan; state: TripState; onVoted: () => Promise<void> }) {
  const mine = state.votes.find((v) => v.memberId === me.id && v.planId === plan.id);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<VoteChoice | null>(null);

  async function vote(choice: VoteChoice) {
    setError("");
    setPending(choice);
    const res = await postJson(`/api/trips/${slug}/votes`, { memberId: me.id, planId: plan.id, choice, comment });
    setPending(null);
    if (!res.ok) setError(res.error ?? "");
    await onVoted();
  }

  const others = state.votes.filter((v) => v.planId === plan.id && v.memberId !== me.id);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {choices.map((c) => (
          <Button
            key={c.value}
            variant={mine?.choice === c.value ? (c.value === "no" ? "danger" : "primary") : "secondary"}
            onClick={() => vote(c.value)}
            disabled={pending !== null}
            aria-pressed={mine?.choice === c.value}
          >
            {pending === c.value ? "…" : c.label}
          </Button>
        ))}
      </div>
      <input
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => mine && comment !== mine.comment && vote(mine.choice)}
        placeholder={mine?.choice === "no" ? "What would make it work for you?" : "Comment (optional)"}
        maxLength={300}
      />
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {others.length > 0 && <OthersVotes votes={others} members={state.members} />}
    </div>
  );
}

function OthersVotes({ votes, members }: { votes: Vote[]; members: Member[] }) {
  const icon = { love: "😍", ok: "🙂", no: "✋" };
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-600 dark:text-stone-400">
      {votes.map((v) => (
        <li key={v.memberId} title={v.comment}>
          {icon[v.choice]} {members.find((m) => m.id === v.memberId)?.name}
        </li>
      ))}
    </ul>
  );
}

function Outcome({ slug, state, plans, refresh }: { slug: string; state: TripState; plans: StoredPlan[]; refresh: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (state.waitingOnVotes.length > 0) return null;

  const candidate = plans.find((p) => p.id === state.candidatePlanId);

  async function settle() {
    if (!candidate) return;
    setBusy(true);
    const res = await postJson(`/api/trips/${slug}/agree`, { planId: candidate.id });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "");
    await refresh();
  }

  async function tryAgain() {
    setError("");
    setBusy(true);
    const res = await postJson(`/api/trips/${slug}/plans`, {});
    setBusy(false);
    if (!res.ok) setError(res.error ?? "");
    await refresh();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const making = busy || state.generating;

  return (
    <Card className="sticky bottom-3 space-y-3 shadow-lg">
      {candidate ? (
        <>
          <p>
            Nobody said no to <span className="font-semibold">{candidate.data.title}</span>, and it got the most love. Settle on this?
          </p>
          <Button onClick={settle} disabled={making} className="w-full">
            Yes, this is our day
          </Button>
        </>
      ) : (
        <p>No single plan works for everyone yet. Claude can make 3 new plans using your votes and comments.</p>
      )}
      <Button variant={candidate ? "secondary" : "primary"} onClick={tryAgain} disabled={making} className="w-full">
        {making ? "Making new plans… (up to a couple of minutes)" : "Make 3 new plans"}
      </Button>
      {error && <Banner tone="warn">{error}</Banner>}
    </Card>
  );
}
