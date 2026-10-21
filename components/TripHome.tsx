"use client";

import Link from "next/link";
import { useState } from "react";
import type { Answer, Budget, Member, TripState } from "@/lib/types";
import { TripHero } from "./TripHero";
import { Banner, Button, Card, Chip, Field, inputClass } from "./ui";
import { postJson, useMe, useTrip } from "./use-trip";

export function TripHome({ slug }: { slug: string }) {
  const { state, notFound, refresh } = useTrip(slug);
  const { meId, setMeId, loaded } = useMe(slug);
  const [editing, setEditing] = useState(false);

  if (notFound) return <Banner tone="warn">This trip link doesn&apos;t exist. Check you copied all of it.</Banner>;
  if (!state || !loaded) return <p className="text-stone-500">Loading trip…</p>;

  const me = state.members.find((m) => m.id === meId) ?? null;
  const myAnswer = me ? state.answers.find((a) => a.memberId === me.id) : undefined;

  return (
    <>
      <TripHero state={state} />
      {!me ? (
        <PickMember members={state.members} answers={state.answers} onPick={setMeId} />
      ) : !myAnswer || editing ? (
        <Questionnaire
          slug={slug}
          me={me}
          existing={myAnswer}
          onDone={async () => {
            setEditing(false);
            await refresh();
          }}
        />
      ) : (
        <>
          <MyConstraints me={me} answer={myAnswer} onEdit={() => setEditing(true)} locked={state.currentRound > 0} />
          <Lobby slug={slug} state={state} refresh={refresh} />
        </>
      )}
      {me && (
        <p className="text-center text-sm text-stone-500">
          You&apos;re {me.name}.{" "}
          <button className="underline" onClick={() => setMeId(null)}>
            Not you?
          </button>
        </p>
      )}
    </>
  );
}

function PickMember({ members, answers, onPick }: { members: Member[]; answers: Answer[]; onPick: (id: number) => void }) {
  return (
    <Card className="space-y-3">
      <h2 className="font-medium">Who are you?</h2>
      <div className="grid grid-cols-2 gap-2">
        {members.map((m) => {
          const done = answers.some((a) => a.memberId === m.id);
          return (
            <Button key={m.id} variant="secondary" onClick={() => onPick(m.id)} className="text-left">
              <span className="block">{m.name}</span>
              <span className="block text-xs font-normal text-stone-500">
                {m.role}, {m.age}
                {done ? " · answered ✓" : ""}
              </span>
            </Button>
          );
        })}
      </div>
    </Card>
  );
}

const energyLabels = ["", "Take it very easy", "Gentle", "Somewhere in between", "Active", "Go all day"];

function Questionnaire({ slug, me, existing, onDone }: { slug: string; me: Member; existing?: Answer; onDone: () => void }) {
  const [energy, setEnergy] = useState(existing?.energy ?? 3);
  const [mustDo, setMustDo] = useState(existing?.mustDo ?? "");
  const [mustAvoid, setMustAvoid] = useState(existing?.mustAvoid ?? "");
  const [food, setFood] = useState(existing?.food ?? "");
  const [maxTravel, setMaxTravel] = useState(existing?.maxTravelMinutes ?? 30);
  const [budget, setBudget] = useState<Budget>(existing?.budget ?? "ok");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await postJson(`/api/trips/${slug}/answers`, {
      memberId: me.id,
      energy,
      mustDo,
      mustAvoid,
      food,
      maxTravelMinutes: maxTravel,
      budget,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "");
    onDone();
  }

  return (
    <form onSubmit={submit}>
      <Card className="space-y-4">
        <h2 className="font-medium">Hi {me.name}, what should the day fit for you?</h2>
        <Field label={`How much energy do you have? ${energyLabels[energy]}`}>
          <input type="range" min={1} max={5} value={energy} onChange={(e) => setEnergy(Number(e.target.value))} className="w-full accent-teal-700" />
        </Field>
        <Field label="One thing you really want to do" hint="Optional">
          <input className={inputClass} value={mustDo} onChange={(e) => setMustDo(e.target.value)} placeholder="e.g. see a temple, go on a boat" />
        </Field>
        <Field label="Anything you want to avoid?" hint="Optional">
          <input className={inputClass} value={mustAvoid} onChange={(e) => setMustAvoid(e.target.value)} placeholder="e.g. long walks, crowds, museums" />
        </Field>
        <Field label="Food likes, dislikes or allergies" hint="Optional">
          <input className={inputClass} value={food} onChange={(e) => setFood(e.target.value)} placeholder="e.g. no seafood, loves noodles" />
        </Field>
        <Field label={`Longest you'd travel between stops: ${maxTravel} min`}>
          <input type="range" min={10} max={90} step={5} value={maxTravel} onChange={(e) => setMaxTravel(Number(e.target.value))} className="w-full accent-teal-700" />
        </Field>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-stone-800 dark:text-stone-200">How does money feel for this day?</legend>
          <div className="grid grid-cols-3 gap-2">
            {(["tight", "ok", "flexible"] as const).map((b) => (
              <Button key={b} type="button" variant={budget === b ? "primary" : "secondary"} onClick={() => setBudget(b)}>
                {b === "ok" ? "OK" : b[0].toUpperCase() + b.slice(1)}
              </Button>
            ))}
          </div>
        </fieldset>
        {error && <Banner tone="warn">{error}</Banner>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Saving…" : existing ? "Update my answers" : "Done"}
        </Button>
      </Card>
    </form>
  );
}

function MyConstraints({ me, answer, onEdit, locked }: { me: Member; answer: Answer; onEdit: () => void; locked: boolean }) {
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{me.name}&apos;s constraints</h2>
        {!locked && (
          <button className="text-sm text-teal-700 underline dark:text-teal-300" onClick={onEdit}>
            Edit
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip>⚡ {energyLabels[answer.energy]}</Chip>
        <Chip>🚌 ≤ {answer.maxTravelMinutes} min between stops</Chip>
        <Chip>💰 money feels {answer.budget}</Chip>
        {answer.mustDo && <Chip tone="good">✅ {answer.mustDo}</Chip>}
        {answer.mustAvoid && <Chip tone="bad">⛔ {answer.mustAvoid}</Chip>}
        {answer.food && <Chip>🍽️ {answer.food}</Chip>}
      </div>
    </Card>
  );
}

function Lobby({ slug, state, refresh }: { slug: string; state: TripState; refresh: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const everyoneAnswered = state.waitingOnAnswers.length === 0;

  async function propose() {
    setError("");
    setBusy(true);
    const res = await postJson(`/api/trips/${slug}/plans`, {});
    setBusy(false);
    if (!res.ok) setError(res.error ?? "");
    await refresh();
  }

  if (state.trip.agreedPlanId) {
    return (
      <Banner tone="good">
        You&apos;ve settled on a plan.{" "}
        <Link href={`/t/${slug}/result`} className="font-medium underline">
          See it
        </Link>
      </Banner>
    );
  }

  if (state.currentRound > 0) {
    return (
      <Link href={`/t/${slug}/plans`} className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-teal-700 to-teal-600 px-4 font-medium text-white shadow-md shadow-teal-900/20 transition-all hover:from-teal-800 hover:to-teal-700 active:scale-[0.98]">
        See the plans and vote
      </Link>
    );
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-medium">The family</h2>
      <ul className="space-y-1 text-sm">
        {state.members.map((m) => {
          const done = state.answers.some((a) => a.memberId === m.id);
          return (
            <li key={m.id} className="flex justify-between">
              <span>{m.name}</span>
              <span className={done ? "text-teal-700 dark:text-teal-300" : "text-stone-500"}>{done ? "answered ✓" : "waiting…"}</span>
            </li>
          );
        })}
      </ul>
      {!everyoneAnswered && (
        <Banner>
          Waiting on {state.waitingOnAnswers.join(", ")}. Give them a nudge and send the link again if needed.
        </Banner>
      )}
      {state.mock && <Banner tone="warn">Demo mode: no Anthropic API key is set, so you&apos;ll see sample plans.</Banner>}
      {error && <Banner tone="warn">{error}</Banner>}
      <Button onClick={propose} disabled={!everyoneAnswered || busy || state.generating} className="w-full">
        {busy || state.generating ? "Making 3 plans… (up to a couple of minutes)" : "Propose plans"}
      </Button>
    </Card>
  );
}
