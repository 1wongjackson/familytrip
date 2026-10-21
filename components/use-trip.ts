"use client";

import { useCallback, useEffect, useState } from "react";
import type { TripState } from "@/lib/types";

const POLL_MS = 3000;

// Every phone polls the same state endpoint, which is plenty for four people.
export function useTrip(slug: string) {
  const [state, setState] = useState<TripState | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${slug}`, { cache: "no-store" });
      if (res.status === 404) return setNotFound(true);
      if (res.ok) setState(await res.json());
    } catch {
      // Offline for a moment; the next poll will catch up.
    }
  }, [slug]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  return { state, notFound, refresh };
}

// Which family member this phone belongs to, remembered per trip.
export function useMe(slug: string) {
  const key = `familytrip:${slug}:member`;
  const [meId, setMeIdState] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      if (v) setMeIdState(Number(v));
    } catch {
      // Storage blocked; the person just picks their name again.
    }
    setLoaded(true);
  }, [key]);

  const setMeId = useCallback(
    (id: number | null) => {
      setMeIdState(id);
      try {
        if (id === null) localStorage.removeItem(key);
        else localStorage.setItem(key, String(id));
      } catch {
        // Not fatal.
      }
    },
    [key],
  );

  return { meId, setMeId, loaded };
}

export async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? "Something went wrong." };
  } catch {
    return { ok: false, error: "Couldn't reach the app. Are you on the same Wi-Fi?" };
  }
}
