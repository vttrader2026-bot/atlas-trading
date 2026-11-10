// Pair list for the screenshot Analyzer selector. Built from the existing cached Binance Spot USDT symbol set
// (getSpotTradingSymbols) — nothing is hardcoded except the quick picks.

export const QUICK_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"] as const;

/** "QNTUSDT" → "QNT/USDT". Returns null for anything that is not a plain USDT symbol. */
export function symbolToPair(symbol: string): string | null {
  const s = symbol.trim().toUpperCase();
  if (!s.endsWith("USDT") || s.length <= 4) return null;
  const base = s.slice(0, -4);
  return /^[A-Z0-9]{1,20}$/.test(base) ? `${base}/USDT` : null;
}

/** All pairs, sorted alphabetically by base asset. */
export function pairsFromSymbols(symbols: Iterable<string> | null | undefined): string[] {
  if (!symbols) return [];
  const out: string[] = [];
  for (const sym of symbols) {
    const p = symbolToPair(sym);
    if (p) out.push(p);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Search by base asset: prefix matches first, then contains. Accepts "qnt", "QNT/USDT", "qntusdt". */
export function searchPairs(pairs: string[], query: string, limit = 40): string[] {
  const q = query.trim().toUpperCase().replace(/[/\-_ ]/g, "").replace(/USDT$/, "");
  if (!q) return pairs.slice(0, limit);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const p of pairs) {
    const base = p.slice(0, -5);
    if (base.startsWith(q)) starts.push(p);
    else if (base.includes(q)) contains.push(p);
  }
  return [...starts, ...contains].slice(0, limit);
}
