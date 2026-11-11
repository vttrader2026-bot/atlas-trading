// BINANCE-HANDOFF-v1
// Keeps ONE Journal trade per Trade Plan. Pure: no storage, no network.
//
//  - upsertPlanTrade(): a plan that already has a Journal trade (matched by planId, or by the draft's journalId) UPDATES that
//    trade. It never adds a second one.
//  - What an update may change follows the server's own rule (lockStrategyFields, EXIT-STRATEGY-v1): entry, quantity,
//    invested amount, exit strategy, exits and status of a stored trade are fixed. Only stop, targets, fee and notes move.
//    Stop and targets are also fixed once the trade has recorded exits or is closed.
//  - fillOutsideSignalZone(): is the member's real fill outside the official entry zone of the signal the plan came from?

import type { Trade } from "@/lib/journal";
import { validateTrade } from "@/lib/journal";
import { checkEntryZone } from "@/lib/eliteConfirm";
import { parseInput } from "@/lib/riskCalc";
import type { TradePlanDraft } from "@/lib/tradePlan";

export type LockedField = "entry" | "size" | "invested";
export type UpsertResult =
  | { ok: true; action: "created" | "updated"; trades: Trade[]; trade: Trade; /** Values the plan now disagrees on but a saved trade cannot change. */ locked: LockedField[] }
  | { ok: false; error: "invalid" };

const differs = (a: number | null | undefined, b: number | null | undefined) => (a ?? null) !== (b ?? null) && Math.abs((a ?? 0) - (b ?? 0)) > 1e-9;

/** The Journal trade that belongs to this plan, if any. planId first, then the plan's own journalId. */
export function findPlanTrade(trades: Trade[], draft: Pick<TradePlanDraft, "id" | "journalId">): Trade | undefined {
  return (
    (draft.id ? trades.find((t) => t.planId === draft.id) : undefined) ??
    (draft.journalId ? trades.find((t) => t.id === draft.journalId) : undefined)
  );
}

export function upsertPlanTrade(trades: Trade[], next: Trade, draft: Pick<TradePlanDraft, "id" | "journalId">, now: number = Date.now()): UpsertResult {
  const prev = findPlanTrade(trades, draft);
  if (!prev) return { ok: true, action: "created", trades: [next, ...trades], trade: next, locked: [] };

  const settled = (prev.exits?.length ?? 0) > 0 || prev.status === "closed";
  const merged: Trade = { ...prev, fees: next.fees ?? null, notes: next.notes, entryReason: next.entryReason, updatedAt: now };
  if (!settled) {
    merged.stop = next.stop;
    merged.target = next.target;
    merged.tp1 = next.tp1;
    merged.tp2 = next.tp2;
    merged.tp3 = next.tp3;
    // The Journal only watches candles from now on when a stop changes, so an edit never closes a trade retroactively.
    if (differs(prev.stop, next.stop)) merged.watchFrom = now;
  }
  if (validateTrade(merged).length > 0) return { ok: false, error: "invalid" };

  const locked: LockedField[] = [];
  if (differs(prev.entry, next.entry)) locked.push("entry");
  if (differs(prev.size, next.size)) locked.push("size");
  if (differs(prev.invested, next.invested)) locked.push("invested");
  return { ok: true, action: "updated", trades: trades.map((t) => (t === prev ? merged : t)), trade: merged, locked };
}

/**
 * True when the plan came from a live signal whose entry zone is readable AND the member's real fill is outside it.
 * Unreadable zone, no fill price, a closed signal or a plan with no signal: false (the existing paths handle those).
 */
export function fillOutsideSignalZone(draft: TradePlanDraft): boolean {
  const link = draft.signal;
  if (!link || draft.manualFill || link.status === "closed") return false;
  const fill = parseInput(draft.actualEntry && parseInput(draft.actualEntry) !== null ? draft.actualEntry : draft.entry);
  if (fill === null) return false;
  const z = checkEntryZone(fill, link.latest.entryZone || link.imported.entryZone);
  return !z.ok && (z.code === "belowZone" || z.code === "aboveZone");
}
