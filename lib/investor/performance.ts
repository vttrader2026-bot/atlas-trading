// ATLAS INVESTOR V1: portfolio value over time, rebuilt from the ledger plus daily closing prices (no snapshots stored).
import { computePositions } from "./calc";
import { InvestorDoc } from "./model";

export type Closes = Record<string, Record<string, number>>; // ticker -> YYYY-MM-DD -> close

export type SeriesPoint = { date: string; value: number; cost: number };

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && out.length < 4000; t += 86_400_000) out.push(day(t));
  return out;
}

/**
 * Value of the holdings on each day (qty held that day x that day's close, carried forward over gaps) next to their cost basis.
 * An asset with no price history that day is valued at its cost basis, and is reported in `approximate`.
 */
export function valueSeries(doc: InvestorDoc, closes: Closes, today: string): { points: SeriesPoint[]; approximate: string[] } {
  const dates = [...doc.purchases.map((p) => p.date), ...doc.sales.map((s) => s.date)].sort();
  if (!dates.length) return { points: [], approximate: [] };
  const approx = new Set<string>();
  const last: Record<string, number | undefined> = {};
  const points: SeriesPoint[] = [];
  for (const d of daysBetween(dates[0], today)) {
    const { positions } = computePositions(doc, d);
    let value = 0, cost = 0;
    for (const p of positions.values()) {
      if (p.qty <= 0) continue;
      cost += p.costBasis;
      const c = closes[p.asset]?.[d];
      if (c !== undefined) last[p.asset] = c;
      const px = last[p.asset];
      if (px === undefined) { value += p.costBasis; approx.add(p.asset); } else value += p.qty * px;
    }
    points.push({ date: d, value, cost });
  }
  return { points, approximate: [...approx] };
}

/** Closing prices by date from daily candles. */
export function closesFrom(klines: { openTime: number; close: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of klines) out[day(k.openTime)] = k.close;
  return out;
}
