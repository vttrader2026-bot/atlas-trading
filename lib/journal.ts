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

export function saveTrades(trades: Trade[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(trades));
}

export function tradePnl(t: Trade): number | null {
  if (t.exit === null) return null;
  const direction = t.side === "Long" ? 1 : -1;
  return (t.exit - t.entry) * direction * t.size;
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
