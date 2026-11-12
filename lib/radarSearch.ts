// Radar search: matches a typed query against ALL rows (every category), by ticker symbol or by coin name.
import { KNOWN } from "@/lib/coinNamesKnown";

type HasSymbol = { ticker: { symbol: string } };

const baseOfSymbol = (symbol: string) => (symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol).toUpperCase();

/** Normalizes what the user typed: trims, drops "/USDT" or "USDT" suffix, upper-cases. Empty string = no search. */
export function normalizeQuery(q: string): string {
  return q.trim().toUpperCase().replace(/[\s/_-]+/g, "").replace(/USDT$/, "");
}

/** Rows whose symbol or known name contains the query. Exact symbol matches come first, then prefixes. */
export function searchRows<T extends HasSymbol>(rows: T[], query: string): T[] {
  const q = normalizeQuery(query);
  if (!q) return rows;
  const scored: { row: T; rank: number }[] = [];
  for (const row of rows) {
    const base = baseOfSymbol(row.ticker.symbol);
    const name = (KNOWN[base] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    let rank = -1;
    if (base === q) rank = 0;
    else if (base.startsWith(q)) rank = 1;
    else if (name.startsWith(q)) rank = 2;
    else if (base.includes(q) || name.includes(q)) rank = 3;
    if (rank >= 0) scored.push({ row, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank).map((x) => x.row);
}
