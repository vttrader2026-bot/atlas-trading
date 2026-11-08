// ATLAS INVESTOR V1: risk simulator. HYPOTHETICAL ESTIMATES ONLY: never predictions, never guarantees.
import { HoldingRow } from "./calc";

export const PRESET_SHOCKS = [-20, -40, -60, -80, 25, 50, 100] as const;

export type Outcome = { shockPct: number; before: number; after: number; change: number; changePct: number };

/** Every priced holding moves by the same percentage. */
export function applyShock(rows: Pick<HoldingRow, "value">[], shockPct: number): Outcome {
  const before = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  const after = Math.max(0, before * (1 + shockPct / 100));
  return { shockPct, before, after, change: after - before, changePct: before > 0 ? ((after - before) / before) * 100 : 0 };
}

/** Largest peak-to-trough fall in a series, as a positive percentage (0 when it never fell or has < 2 points). */
export function maxDrawdownPct(series: number[]): number {
  let peak = -Infinity, worst = 0;
  for (const v of series) {
    if (!Number.isFinite(v) || v <= 0) continue;
    peak = Math.max(peak, v);
    worst = Math.max(worst, (peak - v) / peak);
  }
  return worst * 100;
}

export type DrawdownOutcome = { perAsset: { asset: string; value: number; drawdownPct: number; loss: number }[]; totalLoss: number; totalLossPct: number; before: number; after: number };

/** "Each asset repeats its own worst historical fall." Assets without history are listed with 0% and flagged by the caller. */
export function worstHistoricalScenario(rows: Pick<HoldingRow, "asset" | "value">[], drawdownByAsset: Record<string, number | undefined>): DrawdownOutcome {
  const perAsset = rows
    .filter((r) => r.value !== null && r.value > 0)
    .map((r) => {
      const dd = drawdownByAsset[r.asset] ?? 0;
      return { asset: r.asset, value: r.value as number, drawdownPct: dd, loss: ((r.value as number) * dd) / 100 };
    });
  const before = perAsset.reduce((a, r) => a + r.value, 0);
  const totalLoss = perAsset.reduce((a, r) => a + r.loss, 0);
  return { perAsset, totalLoss, totalLossPct: before > 0 ? (totalLoss / before) * 100 : 0, before, after: before - totalLoss };
}
