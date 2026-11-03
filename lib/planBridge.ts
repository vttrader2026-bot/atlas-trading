// Transfers a Trade Plan into a Journal trade (no re-typing). Pure: the caller supplies id and today's date.

import type { Trade } from "@/lib/journal";
import { computePlan, type PlanError } from "@/lib/planCalc";
import { parseInput } from "@/lib/riskCalc";
import type { TradePlanDraft } from "@/lib/tradePlan";

export const DEFAULT_BALANCE = "1000";
export const DEFAULT_RISK = "1";

export type BridgeResult = { ok: true; trade: Trade } | { ok: false; error: PlanError | "wait" | "pair" };

export function planToTrade(draft: TradePlanDraft, ctx: { id: string; today: string; now?: number }): BridgeResult {
  if (draft.direction === "Wait") return { ok: false, error: "wait" };
  const pair = draft.pair.replace("/", "").trim().toUpperCase();
  if (!pair) return { ok: false, error: "pair" };

  // If the user confirmed a different actual fill, size the position from that price.
  const entryTxt = draft.actualEntry && parseInput(draft.actualEntry) !== null ? draft.actualEntry : draft.entry;
  const sized = computePlan({
    entry: entryTxt,
    invalidation: draft.invalidation,
    tp1: draft.tp1,
    tp2: draft.tp2,
    tp3: draft.tp3,
    balance: draft.balance || DEFAULT_BALANCE,
    riskPct: draft.riskPct || DEFAULT_RISK,
  });
  if (!sized.ok) return sized;

  const tp = (s: string) => {
    const p = parseInput(s);
    const e = parseInput(entryTxt) as number;
    return p !== null && p > e ? p : null;
  };
  const tp1 = tp(draft.tp1);
  const notes = [
    draft.entryZone && `Entry zone: ${draft.entryZone}`,
    draft.invalidationText && `Invalidation: ${draft.invalidationText}`,
    draft.timeframe && `Timeframe: ${draft.timeframe}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ok: true,
    trade: {
      id: ctx.id,
      date: draft.enteredAt || ctx.today,
      pair,
      side: "Long",
      entry: parseInput(entryTxt) as number,
      stop: parseInput(draft.invalidation) as number,
      target: tp1 ?? 0,
      exit: null,
      size: sized.value.quantity,
      notes,
      status: "open",
      tp1,
      tp2: tp(draft.tp2),
      tp3: tp(draft.tp3),
      invested: sized.value.positionUsdt,
      fees: null,
      strategy: "",
      entryReason: draft.reasoning,
      lessons: "",
      planId: draft.id,
      source: "plan",
      updatedAt: ctx.now ?? Date.now(),
    },
  };
}
