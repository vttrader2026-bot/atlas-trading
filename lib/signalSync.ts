"use client";

// Browser-side glue: loads the official feed and refreshes the OFFICIAL part (the `signal` link)
// of the user's local Journal trades and Trade Plan draft. Personal fields are never written
// (see lib/signalLink.ts). Journal changes go through saveTrades(), so signed-in users' journal
// sync carries them to their other devices through the existing architecture.
import type { PublishedTrade } from "@/lib/tradeFeed";
import { loadTrades, saveTrades } from "@/lib/journal";
import { loadDraft, saveDraft } from "@/lib/tradePlan";
import { syncDraft, syncTrades } from "@/lib/signalLink";

export const JOURNAL_EVENT = "atlas-journal-updated";
export const DRAFT_EVENT = "atlas-plan-updated";

export type FeedResult = { ok: true; trades: PublishedTrade[] } | { ok: false; reason: "auth" | "error" };

export async function fetchFeed(): Promise<FeedResult> {
  try {
    const res = await fetch("/api/trade-feed", { cache: "no-store" });
    if (res.status === 401) return { ok: false, reason: "auth" };
    if (!res.ok) return { ok: false, reason: "error" };
    const data = await res.json();
    return { ok: true, trades: Array.isArray(data.trades) ? data.trades : [] };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Updates the official link on linked local records. Returns which stores changed. */
export function syncLocalRecords(signals: PublishedTrade[]): { journal: boolean; draft: boolean } {
  let journal = false;
  let draft = false;
  const trades = loadTrades();
  if (trades.some((t) => t.signal)) {
    const next = syncTrades(trades, signals);
    if (next) {
      saveTrades(next);
      journal = true;
      window.dispatchEvent(new Event(JOURNAL_EVENT));
    }
  }
  const d = loadDraft();
  if (d?.signal) {
    const next = syncDraft(d, signals);
    if (next) {
      saveDraft(next);
      draft = true;
      window.dispatchEvent(new Event(DRAFT_EVENT));
    }
  }
  return { journal, draft };
}
