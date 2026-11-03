// Trade Plan sizing for a spot LONG: reuses the Risk Calculator maths (lib/riskCalc.ts) and adds the
// "never larger than the account balance" cap, per-target profit and risk/reward. Pure, no market data.

import { TP_ALLOCATION } from "@/lib/tradeFeedView";
import { calcRiskBased, parseInput, type RiskError } from "@/lib/riskCalc";
import type { TradePlanDraft } from "@/lib/tradePlan";

export type PlanTarget = {
  key: "TP1" | "TP2" | "TP3";
  price: number;
  /** Profit in USDT if the WHOLE position were sold at this target. */
  profit: number;
  profitPctOfBalance: number;
  /** (target - entry) / (entry - stop). */
  rr: number;
};

export type PlanSizing = {
  /** What the risk % asked for. */
  plannedLoss: number;
  /** Real maximum loss at the stop: lower than plannedLoss when the position was capped. */
  maxLoss: number;
  positionUsdt: number;
  quantity: number;
  stopDistancePct: number;
  lossPctOfBalance: number;
  /** The risk-based size exceeded the balance, so it was reduced to the balance. */
  capped: boolean;
  targets: PlanTarget[];
  /** If scaled out 30 / 40 / 30 across TP1-TP3 (only with all three valid). */
  blended: { profit: number; rr: number } | null;
  /** Non-blocking target problems, e.g. "TP2" at or below entry. */
  targetIssues: { key: "TP1" | "TP2" | "TP3" | "order"; code: "notAboveEntry" | "invalid" | "order" }[];
};

export type PlanError = "incomplete" | RiskError;
export type PlanResult = { ok: true; value: PlanSizing } | { ok: false; error: PlanError };

export type PlanInputs = Pick<TradePlanDraft, "entry" | "invalidation" | "tp1" | "tp2" | "tp3"> & {
  balance: string;
  riskPct: string;
};

export function computePlan(i: PlanInputs): PlanResult {
  const balance = parseInput(i.balance);
  const riskPct = parseInput(i.riskPct);
  const entry = parseInput(i.entry);
  const stop = parseInput(i.invalidation);
  if (balance === null || riskPct === null || entry === null || stop === null) return { ok: false, error: "incomplete" };

  const r = calcRiskBased({ balance, riskPct, entry, stop, tp: null });
  if (!r.ok) return { ok: false, error: r.error };

  const distance = entry - stop;
  const plannedLoss = balance * (riskPct / 100);
  const capped = r.value.exceedsBalance;
  const quantity = capped ? balance / entry : r.value.quantity;
  const positionUsdt = quantity * entry;
  const maxLoss = quantity * distance;

  const issues: PlanSizing["targetIssues"] = [];
  const raw = [i.tp1, i.tp2, i.tp3];
  const keys = ["TP1", "TP2", "TP3"] as const;
  const targets: PlanTarget[] = [];
  const prices: (number | null)[] = [];
  raw.forEach((txt, idx) => {
    if (txt.trim() === "") return void prices.push(null);
    const p = parseInput(txt);
    if (p === null) {
      issues.push({ key: keys[idx], code: "invalid" });
      return void prices.push(null);
    }
    if (!(p > entry)) {
      issues.push({ key: keys[idx], code: "notAboveEntry" });
      return void prices.push(null);
    }
    prices.push(p);
    const profit = quantity * (p - entry);
    targets.push({ key: keys[idx], price: p, profit, profitPctOfBalance: (profit / balance) * 100, rr: (p - entry) / distance });
  });
  const given = targets.map((t) => t.price);
  if (given.some((p, k) => k > 0 && p < given[k - 1])) issues.push({ key: "order", code: "order" });

  let blended: PlanSizing["blended"] = null;
  if (prices.every((p): p is number => p !== null) && !issues.some((x) => x.code === "order")) {
    const avgExit = prices.reduce((s, p, k) => s + (p * TP_ALLOCATION[k]) / 100, 0);
    blended = { profit: quantity * (avgExit - entry), rr: (avgExit - entry) / distance };
  }

  return {
    ok: true,
    value: {
      plannedLoss,
      maxLoss,
      positionUsdt,
      quantity,
      stopDistancePct: (distance / entry) * 100,
      lossPctOfBalance: (maxLoss / balance) * 100,
      capped,
      targets,
      blended,
      targetIssues: issues,
    },
  };
}
