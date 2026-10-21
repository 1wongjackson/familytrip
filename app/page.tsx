"use client";

import Link from "next/link";
import { useState } from "react";
import { Banner, Button, Card, Field, inputClass } from "@/components/ui";
import type { Role } from "@/lib/types";

interface MemberDraft {
  name: string;
  role: Role;
  age: string;
}

const defaultMembers: MemberDraft[] = [
  { name: "", role: "parent", age: "" },
  { name: "", role: "parent", age: "" },
  { name: "", role: "kid", age: "" },
  { name: "", role: "kid", age: "" },
];

export default function CreateTripPage() {
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [hotelArea, setHotelArea] = useState("");
  const [members, setMembers] = useState(defaultMembers);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ slug: string; lanHosts: string[] } | null>(null);

  function updateMember(i: number, patch: Partial<MemberDraft>) {
    setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, date, hotelArea, members }),
    }).catch(() => null);
    setBusy(false);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) return setError(data?.error ?? "Couldn't create the trip.");
    setCreated(data);
  }

  if (created) return <ShareTrip slug={created.slug} lanHosts={created.lanHosts} />;

  return (
    <>
      <div className="space-y-3 pb-2 pt-4">
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight">
          Plan one day{" "}
          <span className="bg-gradient-to-r from-teal-700 via-teal-600 to-amber-500 bg-clip-text text-transparent dark:from-teal-300 dark:to-amber-300">
            everyone
          </span>{" "}
          accepts
        </h1>
        <p className="text-lg text-stone-600 dark:text-stone-400">No more one person doing all the research.</p>
        <ol className="grid grid-cols-3 gap-2 pt-1 text-sm">
          {[
            ["🙋", "Everyone answers"],
            ["🗺️", "Get 3 day plans"],
            ["🗳️", "Vote and settle"],
          ].map(([icon, label], i) => (
            <li key={label} className="rounded-2xl border border-white/70 bg-white/60 px-2 py-3 text-center backdrop-blur dark:border-white/10 dark:bg-white/5">
              <div className="text-xl" aria-hidden>
                {icon}
              </div>
              <div className="mt-1 font-medium text-stone-800 dark:text-stone-200">
                <span className="text-teal-700 dark:text-teal-300">{i + 1}.</span> {label}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-3">
          <Field label="Where are you going?">
            <input className={inputClass} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Kyoto" required />
          </Field>
          <Field label="Which day?">
            <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Where are you staying?" hint="Optional. A neighbourhood is enough.">
            <input className={inputClass} value={hotelArea} onChange={(e) => setHotelArea(e.target.value)} placeholder="e.g. near Kyoto Station" />
          </Field>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-medium">Who&apos;s coming?</h2>
          {members.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_6.5rem_4.5rem] gap-2">
              <input
                className={inputClass}
                aria-label={`Member ${i + 1} name`}
                value={m.name}
                onChange={(e) => updateMember(i, { name: e.target.value })}
                placeholder={m.role === "parent" ? "Parent's name" : "Kid's name"}
                required
              />
              <select className={inputClass} aria-label={`Member ${i + 1} role`} value={m.role} onChange={(e) => updateMember(i, { role: e.target.value as Role })}>
                <option value="parent">Parent</option>
                <option value="kid">Kid</option>
              </select>
              <input
                className={inputClass}
                aria-label={`Member ${i + 1} age`}
                type="number"
                min={0}
                max={120}
                inputMode="numeric"
                value={m.age}
                onChange={(e) => updateMember(i, { age: e.target.value })}
                placeholder="Age"
                required
              />
            </div>
          ))}
        </Card>

        {error && <Banner tone="warn">{error}</Banner>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Creating…" : "Create trip"}
        </Button>
      </form>
    </>
  );
}

function ShareTrip({ slug, lanHosts }: { slug: string; lanHosts: string[] }) {
  const [copied, setCopied] = useState(false);
  const here = typeof window !== "undefined" ? window.location : null;
  const isLocal = here && ["localhost", "127.0.0.1", "[::1]"].includes(here.hostname);
  // On localhost, phones need this computer's Wi-Fi address instead.
  const origin = isLocal && lanHosts[0] ? `${here.protocol}//${lanHosts[0]}:${here.port}` : here?.origin ?? "";
  const link = `${origin}/t/${slug}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="space-y-4">
      <h1 className="text-xl font-semibold">Trip created</h1>
      <p className="text-stone-600 dark:text-stone-400">Send this link to the family. Each person opens it on their own phone and picks their name.</p>
      <div className="break-all rounded-xl bg-stone-100 p-3 font-mono text-sm dark:bg-stone-800">{link}</div>
      {isLocal && (
        <p className="text-xs text-stone-500">
          {lanHosts.length > 0
            ? "This uses your computer's Wi-Fi address, so phones must be on the same Wi-Fi."
            : "No Wi-Fi address found, so this link only works on this computer."}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={copy} className="flex-1">
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Link href={`/t/${slug}`} className="flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-teal-700 to-teal-600 px-4 font-medium text-white shadow-md shadow-teal-900/20 transition-all hover:from-teal-800 hover:to-teal-700 active:scale-[0.98]">
          Open trip
        </Link>
      </div>
    </Card>
  );
}
