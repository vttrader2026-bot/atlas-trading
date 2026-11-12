// ELITE-RECORD-v1: the historical signal performance shown on the Elite page. Built ONLY from real, closed Elite signals that
// an admin closed with a closing record (closeSignal). Nothing is estimated or invented:
//  - the exit level is the signal's own official level (closing.result), the entry is its published entry zone;
//  - "result %" is computed from those two published levels (entry-zone midpoint to exit level). It is NOT an
//    account result: the feed stores no fills, size or fees, and members may enter anywhere in the zone;
//  - CANCELLED signals are listed but never counted as a win or a loss;
//  - OPEN signals are only counted, never shown as results.
import { feedForViewer, tradeTier, type PublishedTrade } from "@/lib/tradeFeed";
import { parsePrice, parseZone } from "@/lib/tradeFeedView";

export type EliteRecord = {
  id: string;
  pair: string;
  direction: "Long" | "Short";
  timeframe: string;
  entryZone: string;
  outcome: "TP1" | "TP2" | "TP3" | "SL" | "CANCELLED";
  exit: string;
  closedAt: number;
  openedAt: number;
  /** % from the entry-zone midpoint to the exit level, rounded to 0.01. Null when it cannot be computed. */
  pct: number | null;
};

export type MonthReport = { month: string; wins: number; losses: number; cancelled: number; closed: number; netPct: number };
export type EliteSummary = {
  closed: number; wins: number; losses: number; cancelled: number; open: number;
  /** wins / (wins + losses), as a percentage; null with no decided trades. */
  winRate: number | null;
  /** Sum of the per-trade published-level results (not compounded, not an account balance). */
  netPct: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function resultPct(t: Pick<PublishedTrade, "entryZone" | "direction">, exit: string): number | null {
  const z = parseZone(t.entryZone);
  const x = parsePrice(exit);
  if (!z || x === null) return null;
  const entry = (z.low + z.high) / 2;
  if (!(entry > 0)) return null;
  const raw = t.direction === "Short" ? ((entry - x) / entry) * 100 : ((x - entry) / entry) * 100;
  return round2(raw);
}

/** Closed, verified Elite signals, newest close first. Uses the feed's own visibility rule (closed Elite = public). */
export function eliteRecords(stored: PublishedTrade[]): EliteRecord[] {
  const { trades } = feedForViewer(stored, false);
  const out: EliteRecord[] = [];
  for (const t of trades) {
    if (tradeTier(t) !== "elite" || t.status !== "closed" || !t.closing || t.closing.verified !== true) continue;
    const { outcome, result, closedAt } = t.closing;
    out.push({
      id: t.id, pair: t.pair, direction: t.direction, timeframe: t.timeframe, entryZone: t.entryZone,
      outcome, exit: result, closedAt, openedAt: t.createdAt,
      pct: outcome === "CANCELLED" ? null : resultPct(t, result),
    });
  }
  return out.sort((a, b) => b.closedAt - a.closedAt);
}

export const openEliteCount = (stored: PublishedTrade[]) =>
  stored.filter((t) => tradeTier(t) === "elite" && (t.status ?? "open") !== "closed").length;

const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7); // UTC "YYYY-MM"

export function monthlyReport(records: EliteRecord[]): MonthReport[] {
  const by = new Map<string, MonthReport>();
  for (const r of records) {
    const m = monthOf(r.closedAt);
    const row = by.get(m) ?? { month: m, wins: 0, losses: 0, cancelled: 0, closed: 0, netPct: 0 };
    if (r.outcome === "CANCELLED") row.cancelled++;
    else {
      row.closed++;
      if (r.outcome === "SL") row.losses++;
      else row.wins++;
      row.netPct = round2(row.netPct + (r.pct ?? 0));
    }
    by.set(m, row);
  }
  return [...by.values()].sort((a, b) => (a.month < b.month ? 1 : -1)); // newest month first
}

export function summarize(records: EliteRecord[], open: number): EliteSummary {
  let wins = 0, losses = 0, cancelled = 0, net = 0;
  for (const r of records) {
    if (r.outcome === "CANCELLED") cancelled++;
    else {
      if (r.outcome === "SL") losses++;
      else wins++;
      net += r.pct ?? 0;
    }
  }
  const decided = wins + losses;
  return { closed: decided, wins, losses, cancelled, open, winRate: decided ? round2((wins / decided) * 100) : null, netPct: round2(net) };
}
