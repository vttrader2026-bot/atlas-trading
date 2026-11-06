"use client";

// ELITE-CONFIRM-v1
// Browser side of Confirm Trade. Every route that turns an ELITE signal into a personal trade (the Confirm Trade
// button, Send to Journal from a Trade Plan, Import from Plan in the Journal) goes through postConfirm(), i.e.
// through the server check. The browser never sends a price; the server fetches its own.
import type { Trade } from "@/lib/journal";
import { loadTrades, normalizeTrade, saveTrades } from "@/lib/journal";
import type { TradePlanDraft } from "@/lib/tradePlan";
import { fetchFeed, JOURNAL_EVENT } from "@/lib/signalSync";

export type ConfirmOutcome =
  | { ok: true; trade: Trade }
  | { ok: false; key: string; price?: number; zone?: { low: number; high: number } };

const ERROR_KEY: Record<string, string> = {
  below_zone: "tradeFeed.cfBelow",
  above_zone: "tradeFeed.cfAbove",
  price_unavailable: "tradeFeed.cfUnavailable",
  price_stale: "tradeFeed.cfStale",
  zone_unreadable: "tradeFeed.cfZoneUnreadable",
  signal_closed: "tradeFeed.cfClosed",
  already_confirmed: "tradeFeed.cfDuplicate",
  signal_not_found: "tradeFeed.cfClosed",
  long_only: "tradeFeed.shortNote",
  invalid_amount: "journal.errInvested",
  invalid_trade: "journal.errStop",
  invalid_strategy: "tradeFeed.cfFailed",
};

export type ConfirmBody = {
  signalId: string;
  entry: number;
  invested: number;
  /** Chosen before confirming; the server stores it with the trade and it cannot be changed afterwards. */
  exitStrategy?: "split" | "tp3";
  plan?: { planId?: string; stop?: number | null; tp1?: number | null; tp2?: number | null; tp3?: number | null; notes?: string; entryReason?: string; date?: string; balance?: number; riskPct?: number };
};

/** Asks the server to confirm. On success the new trade is also put in the local Journal (and the Journal is told). */
export async function postConfirm(body: ConfirmBody): Promise<ConfirmOutcome> {
  try {
    const res = await fetch("/api/me/confirm-trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.trade) {
      const trade = normalizeTrade(data.trade);
      if (trade) {
        const local = loadTrades();
        if (!local.some((x) => x.id === trade.id || (trade.signalId && x.signalId === trade.signalId))) saveTrades([trade, ...local]);
        window.dispatchEvent(new Event(JOURNAL_EVENT));
        return { ok: true, trade };
      }
    }
    if (res.status === 403) return { ok: false, key: "tradeFeed.cfNotElite" };
    const code = typeof data?.error === "string" ? data.error : "";
    return { ok: false, key: ERROR_KEY[code] ?? "tradeFeed.cfFailed", price: data?.price, zone: data?.zone };
  } catch {
    return { ok: false, key: "tradeFeed.cfFailed" };
  }
}

const fmt = (n: number) => String(Number(n.toFixed(8)));
/** Human text for a blocked/failed outcome, with the live price and the zone filled in. */
export function outcomeText(o: { key: string; price?: number; zone?: { low: number; high: number } }, t: (key: string) => string): string {
  return t(o.key)
    .replace("{price}", o.price !== undefined ? fmt(o.price) : "")
    .replace("{low}", o.zone ? fmt(o.zone.low) : "")
    .replace("{high}", o.zone ? fmt(o.zone.high) : "");
}

/**
 * For a Trade Plan linked to a signal: if that signal is in the feed (FREE or ELITE), creates the Journal trade through the
 * server check (using the plan's own entry, size, stop and targets from `planTrade`) and returns the outcome.
 * Returns null when the plan has no signal in the feed, so the normal FREE flow carries on unchanged.
 */
export async function confirmPlanIfElite(draft: TradePlanDraft, planTrade: Trade): Promise<ConfirmOutcome | null> {
  const signalId = draft.signal?.id ?? draft.signalId;
  if (!signalId) return null;
  const feed = await fetchFeed();
  // Any signal the viewer can see in the feed (FREE or ELITE) goes through the server check. A plan with no
  // feed signal behind it (or an unreadable feed) is not a signal confirmation and carries on as before.
  if (!feed.ok || !feed.trades.some((x) => x.id === signalId)) return null;
  return postConfirm({
    signalId,
    entry: planTrade.entry,
    invested: planTrade.invested ?? 0,
    exitStrategy: draft.exitStrategy,
    plan: {
      planId: draft.id,
      stop: planTrade.stop > 0 ? planTrade.stop : null,
      tp1: planTrade.tp1 ?? null,
      tp2: planTrade.tp2 ?? null,
      tp3: planTrade.tp3 ?? null,
      notes: planTrade.notes,
      entryReason: planTrade.entryReason,
      date: planTrade.date,
    },
  });
}
