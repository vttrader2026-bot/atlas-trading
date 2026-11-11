// Transfers a Trade Plan into a Journal trade (no re-typing). Pure: the caller supplies id and today's date.

import type { Trade } from "@/lib/journal";
import { computePlan, type PlanError } from "@/lib/planCalc";
import { parseInput } from "@/lib/riskCalc";
import { requiredTargets, type TradePlanDraft } from "@/lib/tradePlan";

export const DEFAULT_BALANCE = "1000";
export const DEFAULT_RISK = "1";

export type BridgeResult = { ok: true; trade: Trade } | { ok: false; error: PlanError | "wait" | "pair" | "notEntered" | "targets" | "qty" | "fee" };

/** A typed fee: "0" is a valid fee (parseInput itself only accepts values above 0). Null when the text is not a number. */
export function parseFee(text: string): number | null {
  const v = parseInput(text);
  if (v !== null) return v;
  return /^\s*0+([.,٫]0*)?\s*$/.test(text) ? 0 : null;
}

/** Rounds away binary floating-point noise (0.1 * 3) without losing real precision. */
const clean = (n: number) => Number(n.toFixed(8));

/**
 * BINANCE-HANDOFF-v1: `manualFill` builds the trade WITHOUT the official signal link. A fill the member typed in
 * (outside the signal's entry zone) is their own record, never an official signal confirmation.
 */
export function planToTrade(draft: TradePlanDraft, ctx: { id: string; today: string; now?: number; manualFill?: boolean }): BridgeResult {
  if (draft.direction === "Wait") return { ok: false, error: "wait" };
  // An executed trade only exists once the user confirms they entered.
  if (draft.status !== "entered") return { ok: false, error: "notEntered" };
  const pair = draft.pair.replace("/", "").trim().toUpperCase();
  if (!pair) return { ok: false, error: "pair" };

  // If the user confirmed a different actual fill, size the position from that price.
  const entryTxt = draft.actualEntry && parseInput(draft.actualEntry) !== null ? draft.actualEntry : draft.entry;
  const strategy = draft.exitStrategy ?? "split";

  // Optional real fill: quantity and fee exactly as the member typed them. A typed value that is not valid is an error, never ignored.
  const qtyTxt = draft.actualQty?.trim() ?? "";
  const feeTxt = draft.actualFee?.trim() ?? "";
  const actualQty = qtyTxt === "" ? null : parseInput(qtyTxt);
  const actualFee = feeTxt === "" ? null : parseFee(feeTxt);
  if (qtyTxt !== "" && (actualQty === null || !(actualQty > 0))) return { ok: false, error: "qty" };
  if (feeTxt !== "" && (actualFee === null || actualFee < 0)) return { ok: false, error: "fee" };

  const sized = computePlan({
    entry: entryTxt,
    invalidation: draft.invalidation,
    tp1: draft.tp1,
    tp2: draft.tp2,
    tp3: draft.tp3,
    balance: draft.balance || DEFAULT_BALANCE,
    riskPct: draft.riskPct || DEFAULT_RISK,
    sizeMode: draft.sizeMode,
    sizeValue: draft.sizeValue,
    strategy,
  });
  // The planned-size limits (risk %, balance) describe the PLAN. A real fill has already happened, so with an actual quantity
  // those two limits no longer block recording it. Missing numbers and a stop that is not below the entry still do.
  if (!sized.ok && !(actualQty !== null && (sized.error === "riskTooHigh" || sized.error === "investmentTooHigh"))) return sized;

  const tp = (s: string) => {
    const p = parseInput(s);
    const e = parseInput(entryTxt) as number;
    return p !== null && p > e ? p : null;
  };
  // The targets the chosen exit strategy needs must be filled with valid prices above the entry.
  if (requiredTargets(strategy).some((k) => tp(draft[k]) === null)) return { ok: false, error: "targets" };
  // TP3 Only has no TP1 / TP2; the Journal gets TP3 as the target.
  const tp1 = strategy === "tp3" ? null : tp(draft.tp1);
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
      exitStrategy: strategy,
      id: ctx.id,
      date: draft.enteredAt || ctx.today,
      pair,
      side: "Long",
      entry: parseInput(entryTxt) as number,
      stop: parseInput(draft.invalidation) as number,
      target: (strategy === "tp3" ? tp(draft.tp3) : tp1) ?? 0,
      exit: null,
      size: actualQty ?? (sized.ok ? sized.value.quantity : 0),
      notes,
      status: "open",
      tp1,
      tp2: strategy === "tp3" ? null : tp(draft.tp2),
      tp3: tp(draft.tp3),
      // Actual price x actual quantity when a quantity was supplied; otherwise the planned position size, as before.
      invested: actualQty !== null ? clean((parseInput(entryTxt) as number) * actualQty) : sized.ok ? sized.value.positionUsdt : null,
      fees: actualFee,
      strategy: "",
      entryReason: draft.reasoning,
      lessons: "",
      planId: draft.id,
      source: "plan",
      ...(ctx.manualFill ? { manualFill: true } : {}),
      ...(draft.signal && !ctx.manualFill ? { signalId: draft.signal.id, signal: draft.signal } : {}),
      updatedAt: ctx.now ?? Date.now(),
      // AUTO-SL-v1: a trade that starts today is watched from now on
      ...((draft.enteredAt || ctx.today) === ctx.today ? { watchFrom: ctx.now ?? Date.now() } : {}),
    },
  };
}
