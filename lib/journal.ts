export type Trade = {
  id: string;
  date: string;
  pair: string;
  side: "Long" | "Short";
  entry: number;
  stop: number;
  target: number;
  exit: number | null;
  size: number;
  notes: string;
};

const KEY = "atlas-trading.journal.v1";

export function loadTrades(): Trade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Trade[]) : [];
  } catch {
    return [];
  }
}

/** Writes the journal to this device only (no sync side effects). */
export function writeLocalTrades(trades: Trade[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(trades));
}

let saveListener: ((trades: Trade[]) => void) | null = null;

/** Lets account sync hook into saves without this file knowing about accounts. */
export function setJournalSaveListener(fn: ((trades: Trade[]) => void) | null) {
  saveListener = fn;
}

export function saveTrades(trades: Trade[]) {
  writeLocalTrades(trades);
  saveListener?.(trades);
}

export function tradePnl(t: Trade): number | null {
  if (t.exit === null) return null;
  const direction = t.side === "Long" ? 1 : -1;
  return (t.exit - t.entry) * direction * t.size;
}

export type JournalStats = {
  totalTrades: number;
  closedTrades: number;
  winRate: number;
  avgWinner: number;
  avgLoser: number;
  avgRiskPct: number;
  bestPair: { pair: string; pnl: number } | null;
  worstPair: { pair: string; pnl: number } | null;
};

const MIN_CLOSED_FOR_INSIGHTS = 3;

/** Returns null when there isn't enough closed-trade data for honest insights. */
export function computeJournalStats(trades: Trade[]): JournalStats | null {
  const closed = trades.filter((t) => t.exit !== null);
  if (closed.length < MIN_CLOSED_FOR_INSIGHTS) return null;

  const pnls = closed.map((t) => ({ trade: t, pnl: tradePnl(t) as number }));
  const winners = pnls.filter((p) => p.pnl > 0);
  const losers = pnls.filter((p) => p.pnl <= 0);

  const avgWinner = winners.length
    ? winners.reduce((sum, p) => sum + p.pnl, 0) / winners.length
    : 0;
  const avgLoser = losers.length ? losers.reduce((sum, p) => sum + p.pnl, 0) / losers.length : 0;

  const riskPcts = trades
    .filter((t) => t.entry > 0)
    .map((t) => (Math.abs(t.entry - t.stop) / t.entry) * 100);
  const avgRiskPct = riskPcts.length
    ? riskPcts.reduce((sum, r) => sum + r, 0) / riskPcts.length
    : 0;

  const byPair = new Map<string, number>();
  for (const { trade, pnl } of pnls) {
    byPair.set(trade.pair, (byPair.get(trade.pair) ?? 0) + pnl);
  }
  const pairEntries = [...byPair.entries()].map(([pair, pnl]) => ({ pair, pnl }));
  const bestPair = pairEntries.length
    ? pairEntries.reduce((a, b) => (b.pnl > a.pnl ? b : a))
    : null;
  const worstPair = pairEntries.length
    ? pairEntries.reduce((a, b) => (b.pnl < a.pnl ? b : a))
    : null;

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    winRate: (winners.length / closed.length) * 100,
    avgWinner,
    avgLoser,
    avgRiskPct,
    bestPair,
    worstPair,
  };
}

export function tradesToCsv(trades: Trade[]): string {
  const header = ["date", "pair", "side", "entry", "stop", "target", "exit", "size", "pnl", "notes"];
  const rows = trades.map((t) => {
    const pnl = tradePnl(t);
    return [
      t.date,
      t.pair,
      t.side,
      t.entry,
      t.stop,
      t.target,
      t.exit ?? "",
      t.size,
      pnl ?? "",
      `"${t.notes.replace(/"/g, '""')}"`,
    ].join(",");
  });
  return [header.join(","), ...rows].join("\n");
}
