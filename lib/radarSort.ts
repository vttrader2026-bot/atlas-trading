// RADAR SORTING — pure, client-side ordering of the rows Radar already has.
// No data is fetched here and no screening rule/tag is touched: this only
// reorders. Invalid or missing numbers are never coerced to 0 — such rows are
// always placed after every valid row, whichever direction is selected.

import type { RadarRow } from "@/lib/radar";

export type SortKey = "volume" | "change" | "price" | "distHigh" | "distLow" | "name";
export type SortDir = "asc" | "desc";

export const SORT_KEYS: SortKey[] = ["volume", "change", "price", "distHigh", "distLow", "name"];

/** Current Radar behaviour: highest 24h volume first. */
export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "volume", dir: "desc" };

/** The natural first direction for a field: highest / nearest / A–Z. */
export function defaultDir(key: SortKey): SortDir {
  return key === "distHigh" || key === "distLow" || key === "name" ? "asc" : "desc";
}

function num(s: string | number | undefined): number | null {
  if (s === undefined || s === null || s === "") return null;
  const n = typeof s === "number" ? s : Number(s);
  return Number.isFinite(n) ? n : null;
}

/** The comparable value for a row, or null when the data is missing/invalid. */
export function sortValue(row: RadarRow, key: SortKey): number | string | null {
  const t = row.ticker;
  const last = num(t.lastPrice);
  switch (key) {
    case "volume": {
      const v = num(t.quoteVolume);
      return v !== null && v >= 0 ? v : null;
    }
    case "change":
      return num(t.priceChangePercent);
    case "price":
      return last !== null && last > 0 ? last : null;
    case "distHigh": {
      const high = num(t.highPrice);
      if (last === null || last <= 0 || high === null || high <= 0) return null;
      return Math.max(0, ((high - last) / high) * 100);
    }
    case "distLow": {
      const low = num(t.lowPrice);
      if (last === null || last <= 0 || low === null || low <= 0) return null;
      return Math.max(0, ((last - low) / low) * 100);
    }
    case "name": {
      const base = (t.symbol ?? "").replace(/USDT$/, "").trim();
      return base ? base : null;
    }
  }
}

function compare(a: number | string, b: number | string): number {
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
  }
  return (a as number) - (b as number);
}

/** Returns a new array; the input is not mutated. Ties keep their input order. */
export function sortRows(rows: RadarRow[], key: SortKey, dir: SortDir): RadarRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const valid: { row: RadarRow; v: number | string; i: number }[] = [];
  const invalid: { row: RadarRow; i: number }[] = [];
  rows.forEach((row, i) => {
    const v = sortValue(row, key);
    if (v === null) invalid.push({ row, i });
    else valid.push({ row, v, i });
  });
  valid.sort((a, b) => sign * compare(a.v, b.v) || a.i - b.i);
  return [...valid.map((x) => x.row), ...invalid.map((x) => x.row)];
}
