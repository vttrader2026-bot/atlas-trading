// Trading Journal model, storage and maths. Pure except for the clearly marked localStorage helpers.
//
// Compatibility: this is a strict SUPERSET of the original record
// ({ id, date, pair, side, entry, stop, target, exit, size, notes }). Every new field is optional, so
// records saved by older versions load unchanged and older cached bundles can still read newer ones.
// `size` stays the coin quantity and `date` stays the entry date.

export type TradeStatus = "open" | "closed";

export type Trade = {
  id: string;
  /** Entry date, YYYY-MM-DD. */
  date: string;
  pair: string;
  /** Legacy records may be "Short". New records are always spot "Long". */
  side: "Long" | "Short";
  entry: number;
  stop: number;
  /** Original single target. For new records this mirrors tp1. */
  target: number;
  exit: number | null;
  /** Coin quantity. */
  size: number;
  notes: string;

  status?: TradeStatus;
  exitDate?: string | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  /** Cost basis in USDT. Falls back to entry * size when absent. */
  invested?: number | null;
  /** Total trading fees in USDT (entry + exit combined). */
  fees?: number | null;
  strategy?: string;
  entryReason?: string;
  lessons?: string;
  /** Optional manual current price used for unrealized PnL when no live price is available. */
  markPrice?: number | null;
  /** Trade Plan this trade came from. */
  planId?: string;
  source?: "manual" | "plan";
  updatedAt?: number;
};

export const KEY = "atlas-trading.journal.v1";
const BACKUP_KEY = "atlas-trading.journal.v1.backup";

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown, fallback = 0): number => {
  const n = typeof x === "string" ? Number(x.replace(/,/g, "")) : (x as number);
  return typeof x !== "boolean" && typeof n === "number" && Number.isFinite(n) ? n : fallback;
};
const numOrNull = (x: unknown): number | null => {
  if (x === null || x === undefined || x === "") return null;
  const n = num(x, NaN);
  return Number.isFinite(n) ? n : null;
};
const str = (x: unknown) => (typeof x === "string" ? x : "");

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Turns any stored/synced object into a valid Trade WITHOUT dropping unknown fields.
 * Never throws; missing legacy ids get a deterministic one so repeated loads agree.
 */
export function normalizeTrade(raw: unknown, index = 0): Trade | null {
  if (!isObj(raw)) return null;
  const side = raw.side === "Short" ? "Short" : "Long";
  const exit = numOrNull(raw.exit);
  const t: Trade = {
    ...(raw as object),
    id: typeof raw.id === "string" && raw.id ? raw.id : `legacy-${index}-${djb2(JSON.stringify(raw))}`,
    date: str(raw.date),
    pair: str(raw.pair),
    side,
    entry: num(raw.entry),
    stop: num(raw.stop),
    target: num(raw.target),
    exit,
    size: num(raw.size),
    notes: str(raw.notes),
  };
  if (raw.status === "open" || raw.status === "closed") t.status = raw.status;
  else delete t.status;
  return t;
}

export function normalizeTrades(raw: unknown): Trade[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => normalizeTrade(r, i)).filter((t): t is Trade => t !== null);
}

// ───────────────────────── storage (browser only) ─────────────────────────

export function loadTrades(): Trade[] {
  if (typeof window === "undefined") return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
    return raw ? normalizeTrades(JSON.parse(raw)) : [];
  } catch {
    // Unreadable data: keep a copy before anything can overwrite it, then start empty.
    try {
      if (raw) window.localStorage.setItem(`${KEY}.corrupt-${Date.now()}`, raw);
    } catch {
      /* storage full or unavailable */
    }
    return [];
  }
}

/** Writes the journal to this device only (no sync side effects). */
export function writeLocalTrades(trades: Trade[]) {
  if (typeof window === "undefined") return;
  try {
    // One-time safety copy of exactly what the previous version stored, before the first new-format write.
    const existing = window.localStorage.getItem(KEY);
    if (existing && !window.localStorage.getItem(BACKUP_KEY)) window.localStorage.setItem(BACKUP_KEY, existing);
  } catch {
    /* best effort */
  }
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

// ───────────────────────────── maths (pure) ─────────────────────────────

/** Closed only when it has an exit price; an explicit "open" always wins. */
export function statusOf(t: Trade): TradeStatus {
  const hasExit = t.exit !== null && t.exit !== undefined && Number.isFinite(t.exit);
  if (t.status === "open") return "open";
  return hasExit ? "closed" : "open";
}

const dirOf = (t: Trade) => (t.side === "Short" ? -1 : 1);

export function investedOf(t: Trade): number {
  return t.invested !== null && t.invested !== undefined && t.invested > 0 ? t.invested : t.entry * t.size;
}

export function feesOf(t: Trade): number {
  return t.fees !== null && t.fees !== undefined && t.fees > 0 ? t.fees : 0;
}

/** Price-only result at `price`, before fees. */
export function grossPnl(t: Trade, price: number): number {
  return (price - t.entry) * dirOf(t) * t.size;
}

/** Net realized PnL (after fees) for a closed trade, otherwise null. */
export function realizedPnl(t: Trade): number | null {
  if (statusOf(t) !== "closed" || t.exit === null) return null;
  return grossPnl(t, t.exit) - feesOf(t);
}

/** Kept under its original name: net realized PnL (identical to the old value when no fees are set). */
export const tradePnl = realizedPnl;

/** Price change entry -> exit in %, before fees. */
export function pnlPct(t: Trade): number | null {
  if (statusOf(t) !== "closed" || t.exit === null || !(t.entry > 0)) return null;
  return ((t.exit - t.entry) / t.entry) * 100 * dirOf(t);
}

/** Return on investment in %: net PnL / invested. */
export function roiPct(t: Trade): number | null {
  const p = realizedPnl(t);
  const inv = investedOf(t);
  return p === null || !(inv > 0) ? null : (p / inv) * 100;
}

/** Unrealized PnL of an OPEN trade at `price` (fees provided so far are deducted). */
export function unrealizedPnl(t: Trade, price: number | null | undefined): number | null {
  if (statusOf(t) !== "open" || price === null || price === undefined || !(price > 0)) return null;
  return grossPnl(t, price) - feesOf(t);
}

export function unrealizedRoiPct(t: Trade, price: number | null | undefined): number | null {
  const p = unrealizedPnl(t, price);
  const inv = investedOf(t);
  return p === null || !(inv > 0) ? null : (p / inv) * 100;
}

/** Planned loss at the stop, from entry (positive number), when a stop is set. */
export function plannedLoss(t: Trade): number | null {
  const d = (t.entry - t.stop) * dirOf(t);
  return t.stop > 0 && t.entry > 0 && d > 0 ? d * t.size : null;
}

// ───────────────────────────── validation ─────────────────────────────

export type TradeIssue =
  | "pair"
  | "date"
  | "entry"
  | "stop"
  | "quantity"
  | "invested"
  | "tp"
  | "tpOrder"
  | "fees"
  | "exitRequired"
  | "exitDate"
  | "exitBeforeEntry";

export type TradeIssueField = { field: string; code: TradeIssue };

const isDate = (s: string | null | undefined): boolean => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Spot LONG rules for new/edited trades (legacy Short records are validated mirror-wise so they stay editable). */
export function validateTrade(t: Trade): TradeIssueField[] {
  const out: TradeIssueField[] = [];
  const dir = dirOf(t);
  const closed = t.status === "closed";
  if (!t.pair.trim()) out.push({ field: "pair", code: "pair" });
  if (!isDate(t.date)) out.push({ field: "date", code: "date" });
  if (!(t.entry > 0)) out.push({ field: "entry", code: "entry" });
  if (!(t.size > 0)) out.push({ field: "size", code: "quantity" });
  if (t.invested !== null && t.invested !== undefined && !(t.invested > 0)) out.push({ field: "invested", code: "invested" });
  if (t.fees !== null && t.fees !== undefined && t.fees < 0) out.push({ field: "fees", code: "fees" });
  if (t.entry > 0 && t.stop > 0 && !((t.entry - t.stop) * dir > 0)) out.push({ field: "stop", code: "stop" });
  const tps = [t.tp1, t.tp2, t.tp3];
  tps.forEach((v, i) => {
    if (v !== null && v !== undefined && !(t.entry > 0 && (v - t.entry) * dir > 0)) out.push({ field: `tp${i + 1}`, code: "tp" });
  });
  const given = tps.filter((v): v is number => v !== null && v !== undefined);
  if (dir === 1 && given.some((v, i) => i > 0 && v < given[i - 1])) out.push({ field: "tp3", code: "tpOrder" });
  if (closed) {
    if (t.exit === null || t.exit === undefined || !(t.exit > 0)) out.push({ field: "exit", code: "exitRequired" });
    if (!isDate(t.exitDate ?? "")) out.push({ field: "exitDate", code: "exitDate" });
    else if (isDate(t.date) && (t.exitDate as string) < t.date) out.push({ field: "exitDate", code: "exitBeforeEntry" });
  }
  return out;
}

// ───────────────────────────── dashboard ─────────────────────────────

export type Dashboard = {
  total: number;
  open: number;
  closed: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** null until at least one trade is closed. */
  winRate: number | null;
  realizedPnl: number;
  avgWin: number | null;
  avgLoss: number | null;
  best: { trade: Trade; pnl: number } | null;
  worst: { trade: Trade; pnl: number } | null;
};

export function computeDashboard(trades: Trade[]): Dashboard {
  const closed = trades
    .map((trade) => ({ trade, pnl: realizedPnl(trade) }))
    .filter((x): x is { trade: Trade; pnl: number } => x.pnl !== null);
  const wins = closed.filter((x) => x.pnl > 0);
  const losses = closed.filter((x) => x.pnl < 0);
  const sum = (a: { pnl: number }[]) => a.reduce((s, x) => s + x.pnl, 0);
  const pick = (cmp: (a: number, b: number) => boolean) =>
    closed.length ? closed.reduce((a, b) => (cmp(b.pnl, a.pnl) ? b : a)) : null;
  return {
    total: trades.length,
    open: trades.length - closed.length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: closed.length - wins.length - losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    realizedPnl: sum(closed),
    avgWin: wins.length ? sum(wins) / wins.length : null,
    avgLoss: losses.length ? sum(losses) / losses.length : null,
    best: pick((a, b) => a > b),
    worst: pick((a, b) => a < b),
  };
}

// ───────────────────────────── history helpers ─────────────────────────────

export type SortKey = "date" | "pair" | "pnl" | "invested";
export type StatusFilter = "all" | "open" | "closed";

export function filterAndSort(
  trades: Trade[],
  opts: { query: string; status: StatusFilter; sort: SortKey; desc: boolean },
): Trade[] {
  const q = opts.query.trim().toLowerCase();
  const rows = trades.filter((t) => {
    if (opts.status !== "all" && statusOf(t) !== opts.status) return false;
    if (!q) return true;
    return [t.pair, t.strategy, t.entryReason, t.notes, t.lessons, t.date, t.exitDate]
      .map((x) => (x ?? "").toLowerCase())
      .some((s) => s.includes(q));
  });
  const key = (t: Trade): number | string => {
    switch (opts.sort) {
      case "pair":
        return t.pair.toLowerCase();
      case "pnl":
        return realizedPnl(t) ?? Number.NEGATIVE_INFINITY;
      case "invested":
        return investedOf(t);
      default:
        return t.date || "";
    }
  };
  const dir = opts.desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x < y) return -1 * dir;
    if (x > y) return 1 * dir;
    return 0;
  });
}

// ───────────────────────────── CSV ─────────────────────────────

export const CSV_COLUMNS = [
  "id",
  "status",
  "pair",
  "side",
  "entry_date",
  "entry_price",
  "exit_date",
  "exit_price",
  "stop_loss",
  "tp1",
  "tp2",
  "tp3",
  "invested_usdt",
  "quantity",
  "fees_usdt",
  "gross_pnl_usdt",
  "realized_pnl_usdt",
  "pnl_pct",
  "roi_pct",
  "strategy",
  "entry_reason",
  "notes",
  "lessons",
  "source",
] as const;

/** Text cell: quote it, double inner quotes, and defuse spreadsheet formulas (=, +, -, @, tab, CR). */
function textCell(s: string | undefined): string {
  let v = s ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

const numCell = (n: number | null | undefined, digits = 8): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "" : String(Number(n.toFixed(digits)));

export function tradesToCsv(trades: Trade[]): string {
  const rows = trades.map((t) => {
    const closed = statusOf(t) === "closed" && t.exit !== null;
    return [
      textCell(t.id),
      statusOf(t),
      textCell(t.pair),
      t.side,
      t.date,
      numCell(t.entry),
      closed ? (t.exitDate ?? "") : "",
      closed ? numCell(t.exit) : "",
      numCell(t.stop),
      numCell(t.tp1 ?? (t.target || null)),
      numCell(t.tp2),
      numCell(t.tp3),
      numCell(investedOf(t), 6),
      numCell(t.size),
      numCell(t.fees ?? null, 6),
      closed ? numCell(grossPnl(t, t.exit as number), 6) : "",
      numCell(realizedPnl(t), 6),
      numCell(pnlPct(t), 4),
      numCell(roiPct(t), 4),
      textCell(t.strategy),
      textCell(t.entryReason),
      textCell(t.notes),
      textCell(t.lessons),
      t.source ?? "manual",
    ].join(",");
  });
  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}
