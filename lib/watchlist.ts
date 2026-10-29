// Pure watchlist logic shared by the server route and the browser store:
// symbol validation, merging, the add/remove/merge/seen operations (with the
// plan limit), and sorting. No I/O in here, so it is easy to test.
import type { RadarRow, Setup } from "@/lib/radar";

export type WatchItem = { symbol: string; addedAt: number };
export type StatusKey = Setup | "outside" | "delisted";
export const STATUS_KEYS: StatusKey[] = [
  "breakout", "pullback", "breakoutWatch", "atSupport", "relativeStrength", "relativeWeakness", "watching", "outside", "delisted",
];
const isStatus = (v: unknown): v is StatusKey => typeof v === "string" && (STATUS_KEYS as string[]).includes(v);
export type WatchState = { items: WatchItem[]; seen: Record<string, string> };

const SYMBOL_RE = /^[A-Z0-9]{2,20}USDT$/;
const MAX_MERGE = 200;

/** "btc", "BTC/USDT", "eth-usdt", "SOLUSDT" -> "BTCUSDT" | null. */
export function normalizeSymbol(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim().toUpperCase();
  // "BTC/ETH" is not a USDT pair: with a separator the quote side must be USDT.
  const parts = text.split(/[\s/_-]+/).filter(Boolean);
  if (parts.length > 2 || (parts.length === 2 && parts[1] !== "USDT")) return null;
  const raw = parts.join("");
  if (!raw) return null;
  const sym = raw.endsWith("USDT") ? raw : raw + "USDT";
  if (!SYMBOL_RE.test(sym) || sym === "USDTUSDT") return null;
  return sym;
}

export function baseOf(symbol: string): string {
  return symbol.replace(/USDT$/, "");
}

export function emptyState(): WatchState {
  return { items: [], seen: {} };
}

export function normalizeItems(raw: unknown): WatchItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: WatchItem[] = [];
  for (const x of raw) {
    const sym = normalizeSymbol(typeof x === "string" ? x : (x as { symbol?: unknown } | null)?.symbol);
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    const at = Number((x as { addedAt?: unknown } | null)?.addedAt);
    out.push({ symbol: sym, addedAt: Number.isFinite(at) && at > 0 ? at : 0 });
  }
  return out;
}

export function normalizeSeen(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const sym = normalizeSymbol(k);
    if (sym && isStatus(v)) out[sym] = v;
  }
  return out;
}

export function normalizeState(raw: unknown): WatchState {
  const r = (raw && typeof raw === "object" ? raw : {}) as { items?: unknown; seen?: unknown };
  const items = normalizeItems(r.items);
  const seen = normalizeSeen(r.seen);
  const keep = new Set(items.map((i) => i.symbol));
  for (const k of Object.keys(seen)) if (!keep.has(k)) delete seen[k];
  return { items, seen };
}

/** Union of two lists, no duplicates (earliest addedAt wins), order = first list then new ones. */
export function mergeItems(a: WatchItem[], b: WatchItem[]): WatchItem[] {
  const map = new Map<string, WatchItem>();
  for (const it of [...a, ...b]) {
    const cur = map.get(it.symbol);
    if (!cur) map.set(it.symbol, it);
    else if (it.addedAt && (!cur.addedAt || it.addedAt < cur.addedAt)) map.set(it.symbol, { ...cur, addedAt: it.addedAt });
  }
  return [...map.values()];
}

export type WatchOp =
  | { op: "add"; symbol: unknown }
  | { op: "remove"; symbol: unknown }
  | { op: "merge"; symbols: unknown }
  | { op: "seen"; seen: unknown };

export type OpResult =
  | { ok: true; state: WatchState; dropped: number }
  | { ok: false; error: "invalid" | "limit" };

/** Applies one operation, enforcing the plan limit. Never mutates `state`. */
export function applyOp(state: WatchState, op: WatchOp, limit: number, now: number = Date.now()): OpResult {
  const cur = normalizeState(state);
  switch (op.op) {
    case "add": {
      const sym = normalizeSymbol(op.symbol);
      if (!sym) return { ok: false, error: "invalid" };
      if (cur.items.some((i) => i.symbol === sym)) return { ok: true, state: cur, dropped: 0 };
      if (cur.items.length >= limit) return { ok: false, error: "limit" };
      return { ok: true, state: { ...cur, items: [...cur.items, { symbol: sym, addedAt: now }] }, dropped: 0 };
    }
    case "remove": {
      const sym = normalizeSymbol(op.symbol);
      if (!sym) return { ok: false, error: "invalid" };
      const seen = { ...cur.seen };
      delete seen[sym];
      return { ok: true, state: { items: cur.items.filter((i) => i.symbol !== sym), seen }, dropped: 0 };
    }
    case "merge": {
      if (!Array.isArray(op.symbols) || op.symbols.length > MAX_MERGE) return { ok: false, error: "invalid" };
      const incoming = normalizeItems(op.symbols).map((i) => ({ ...i, addedAt: i.addedAt || now }));
      const have = new Set(cur.items.map((i) => i.symbol));
      const fresh = incoming.filter((i) => !have.has(i.symbol));
      const room = Math.max(0, limit - cur.items.length);
      const take = fresh.slice(0, room);
      return { ok: true, state: { ...cur, items: [...cur.items, ...take] }, dropped: fresh.length - take.length };
    }
    case "seen": {
      const incoming = normalizeSeen(op.seen);
      const have = new Set(cur.items.map((i) => i.symbol));
      const seen = { ...cur.seen };
      for (const [k, v] of Object.entries(incoming)) if (have.has(k)) seen[k] = v;
      return { ok: true, state: { ...cur, seen }, dropped: 0 };
    }
    default:
      return { ok: false, error: "invalid" };
  }
}

// ---- Radar status -------------------------------------------------------

/** Order used when sorting by Radar status: most actionable first, unscored last. */
export const STATUS_ORDER: StatusKey[] = STATUS_KEYS;

/** The new status to announce, only when it differs from the one saved at the last visit. */
export function statusChange(prev: string | undefined, cur: StatusKey | null): StatusKey | null {
  if (!cur || !isStatus(prev) || prev === cur) return null; // new coin / no data / garbage: nothing to compare
  if (cur === "delisted" || cur === "outside") return null; // "no data" is not a real change
  return cur;
}

// ---- Sorting ------------------------------------------------------------

export type WatchSortKey = "added" | "price" | "change" | "volume" | "status";
export type WatchSortDir = "asc" | "desc";
export const WATCH_SORT_KEYS: WatchSortKey[] = ["added", "price", "change", "volume", "status"];

export type WatchRow = {
  symbol: string;
  base: string;
  addedAt: number;
  price: number | null;
  change: number | null;
  volume: number | null;
  status: StatusKey | null; // null = no market data yet
  radar: RadarRow | null;
};

function valueFor(r: WatchRow, key: WatchSortKey): number | null {
  switch (key) {
    case "added": return r.addedAt > 0 ? r.addedAt : null;
    case "price": return r.price !== null && Number.isFinite(r.price) && r.price > 0 ? r.price : null;
    case "change": return r.change !== null && Number.isFinite(r.change) ? r.change : null;
    case "volume": return r.volume !== null && Number.isFinite(r.volume) && r.volume >= 0 ? r.volume : null;
    case "status": return r.status ? STATUS_ORDER.indexOf(r.status) : null;
  }
}

/** Missing/invalid values are never treated as 0: those rows always go last. Ties keep saved order. */
export function sortWatchRows(rows: WatchRow[], key: WatchSortKey, dir: WatchSortDir): WatchRow[] {
  const ok: { r: WatchRow; v: number; i: number }[] = [];
  const bad: WatchRow[] = [];
  rows.forEach((r, i) => {
    const v = valueFor(r, key);
    if (v === null) bad.push(r);
    else ok.push({ r, v, i });
  });
  const s = dir === "asc" ? 1 : -1;
  ok.sort((a, b) => s * (a.v - b.v) || a.i - b.i);
  return [...ok.map((x) => x.r), ...bad];
}

/** Analyzer result "BTC/USDT" -> "BTCUSDT"; anything that is not a USDT pair -> null. */
export function pairToSymbol(pair: unknown): string | null {
  if (typeof pair !== "string") return null;
  const p = pair.trim().toUpperCase();
  if (!/USDT$/.test(p.replace(/[\s/_-]+/g, ""))) return null;
  return normalizeSymbol(p);
}
