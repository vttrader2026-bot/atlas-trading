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
