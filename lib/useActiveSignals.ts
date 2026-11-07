"use client";

import { useEffect, useState } from "react";
import { indexFromPublic, normalizeSymbol, type ActiveSignalIndex, type ActiveSignalRef } from "@/lib/activeSignals";

// One shared request for every page and component, cached for a minute. The endpoint is public and returns only
// { symbol, id }, so visitors who are logged out see the badges too.
const TTL_MS = 60_000;
let cache: { at: number; index: ActiveSignalIndex } | null = null;
let inflight: Promise<ActiveSignalIndex> | null = null;

async function load(): Promise<ActiveSignalIndex> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.index;
  inflight ??= fetch("/api/active-signals")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const index = indexFromPublic(d?.signals);
      cache = { at: Date.now(), index };
      return index;
    })
    .catch(() => new Map() as ActiveSignalIndex)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Returns a lookup: coin (BTC, BTCUSDT, BTC/USDT) -> its active Trade Feed setup, if any. */
export function useActiveSignals(): (symbol: string) => ActiveSignalRef | null {
  const [index, setIndex] = useState<ActiveSignalIndex>(new Map());
  useEffect(() => {
    let live = true;
    void load().then((i) => live && setIndex(i));
    return () => {
      live = false;
    };
  }, []);
  return (symbol) => index.get(normalizeSymbol(symbol)) ?? null;
}
