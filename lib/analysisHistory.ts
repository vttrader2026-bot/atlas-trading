export type HistoryEntry = {
  id: string;
  date: string;
  pair: string;
  timeframe: string;
  marketStructure: string;
  currentCondition: string;
  tradeDirection: string;
};

const STORAGE_KEY = "atlas-trading.analysisHistory.v1";
const MAX_ENTRIES = 10;

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function addHistoryEntry(entry: Omit<HistoryEntry, "id" | "date">) {
  if (typeof window === "undefined") return;
  const existing = loadHistory();
  const next: HistoryEntry[] = [
    {
      ...entry,
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
    },
    ...existing,
  ].slice(0, MAX_ENTRIES);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

const DUPLICATE_WINDOW_MS = 60_000;
const text = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Saves one finished analysis (Analyzer upload or chart panel) through addHistoryEntry.
 * Returns false and saves nothing for a failed or malformed response, and for an identical entry
 * that was just saved (a double-fired handler), so the Workflow count only grows per real analysis.
 */
export function recordAnalysis(data: unknown): boolean {
  if (typeof window === "undefined" || !data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const ms = d.marketStructure as Record<string, unknown> | null | undefined;
  const plan = d.tradePlan as Record<string, unknown> | null | undefined;
  if (typeof d.pair !== "string" || !d.pair.trim() || !ms || typeof ms !== "object" || !plan || typeof plan !== "object") return false;
  const cond = d.currentCondition as Record<string, unknown> | null | undefined;
  const entry = {
    pair: d.pair,
    timeframe: text(d.timeframe),
    marketStructure: text(ms.state),
    currentCondition: text(cond?.label),
    tradeDirection: text(plan.direction),
  };
  try {
    const last = loadHistory()[0];
    if (
      last &&
      Date.now() - Date.parse(last.date) < DUPLICATE_WINDOW_MS &&
      last.pair === entry.pair &&
      last.timeframe === entry.timeframe &&
      last.marketStructure === entry.marketStructure &&
      last.currentCondition === entry.currentCondition &&
      last.tradeDirection === entry.tradeDirection
    ) return false;
    addHistoryEntry(entry);
    return true;
  } catch {
    return false; // storage full or blocked: the analysis itself is unaffected
  }
}
