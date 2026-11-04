// Links an official Atlas signal (Trade Feed) to a user's personal records (Trade Plan draft,
// Journal trade, watch list) through the signal's unique id.
//
// Separation rule: the OFFICIAL data lives in the feed and, per record, in a `SignalLink`
// (a copy of what Atlas published, refreshed by sync). The PERSONAL data (entry, stop-loss,
// targets, size, exit, fees, notes) lives in the record's own fields. Sync functions here only
// ever write the link; they never touch a personal field. Pure: no storage, no network.

import type { PublishedTrade } from "@/lib/tradeFeed";
import type { Trade } from "@/lib/journal";
import type { TradePlanDraft } from "@/lib/tradePlan";

export type SignalStatus = "open" | "closed";
export type SignalLevels = { entryZone: string; invalidation: string; tp1: string; tp2: string; tp3: string };

export type SignalLink = {
  /** Unique Signal ID (the Trade Feed record's id). */
  id: string;
  /** The bot's own id (e.g. "T075"), when it has one. */
  tradeId?: string;
  pair: string;
  timeframe: string;
  /** Official levels at the moment the user linked the signal. Never edited afterwards. */
  imported: SignalLevels;
  /** Official levels as of the last sync. */
  latest: SignalLevels;
  status: SignalStatus;
  hitLevels: string[];
  syncedAt: number;
};

const str = (x: unknown) => (typeof x === "string" ? x : "");

// ───────────────────────── reading numbers out of published text ─────────────────────────

/** Numbers in a published string, ignoring timeframe tokens such as "4H" or "1D". */
export function numbersIn(text: string | null | undefined): number[] {
  if (!text) return [];
  const out: number[] = [];
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 3);
    if (/^\s?[hHdDwWmM](?![a-zA-Z])/.test(after)) continue;
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

/** A single unambiguous price, otherwise null (the user must enter it themselves). */
export function priceOf(text: string | null | undefined): number | null {
  const n = numbersIn(text);
  return n.length === 1 ? n[0] : null;
}

/** "61,200 - 61,800" -> {low, high}; one number -> zero-width zone; anything else -> null. */
export function zoneOf(text: string | null | undefined): { low: number; high: number } | null {
  const n = numbersIn(text);
  if (n.length === 1) return { low: n[0], high: n[0] };
  if (n.length === 2) return { low: Math.min(...n), high: Math.max(...n) };
  return null;
}

export type NumericSignal = {
  zone: { low: number; high: number } | null;
  /** Conservative planning entry: the top of the zone. */
  entry: number | null;
  stop: number | null;
  tps: [number | null, number | null, number | null];
};

export function numericLevels(l: SignalLevels): NumericSignal {
  const zone = zoneOf(l.entryZone);
  return { zone, entry: zone ? zone.high : null, stop: priceOf(l.invalidation), tps: [priceOf(l.tp1), priceOf(l.tp2), priceOf(l.tp3)] };
}

const plain = (n: number | null): string => (n === null ? "" : String(Number(n.toFixed(8))));

// ───────────────────────── links ─────────────────────────

export const isLongSignal = (s: PublishedTrade) => s.direction === "Long";
/** A signal that can still be entered: open and no stop-loss hit. */
export const isLiveSignal = (s: Pick<PublishedTrade, "status" | "hitLevels">) =>
  (s.status ?? "open") !== "closed" && !(s.hitLevels ?? []).includes("SL");

export function signalLevels(s: PublishedTrade): SignalLevels {
  return { entryZone: s.entryZone ?? "", invalidation: s.invalidation ?? "", tp1: s.tp1 ?? "", tp2: s.tp2 ?? "", tp3: s.tp3 ?? "" };
}

export function linkFromSignal(s: PublishedTrade, now = Date.now()): SignalLink {
  const lv = signalLevels(s);
  const link: SignalLink = {
    id: s.id,
    pair: s.pair,
    timeframe: s.timeframe ?? "",
    imported: lv,
    latest: { ...lv },
    status: s.status === "closed" ? "closed" : "open",
    hitLevels: [...(s.hitLevels ?? [])],
    syncedAt: now,
  };
  if (s.tradeId) link.tradeId = s.tradeId;
  return link;
}

const LEVEL_KEYS = ["entryZone", "invalidation", "tp1", "tp2", "tp3"] as const;
const sameLevels = (a: SignalLevels, b: SignalLevels) => LEVEL_KEYS.every((k) => a[k] === b[k]);
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Returns the same object when nothing official changed, so callers can skip saving. */
export function refreshLink(link: SignalLink, s: PublishedTrade, now = Date.now()): SignalLink {
  const latest = signalLevels(s);
  const status: SignalStatus = s.status === "closed" ? "closed" : "open";
  const hit = s.hitLevels ?? [];
  if (sameLevels(link.latest, latest) && link.status === status && sameList(link.hitLevels, hit)) return link;
  return { ...link, latest, status, hitLevels: [...hit], syncedAt: now };
}

export type SignalChange = { field: "invalidation" | "tp1" | "tp2" | "tp3"; from: string; to: string };

/** Official stop-loss / target changes since the user imported the signal. */
export function signalChanges(link: SignalLink): SignalChange[] {
  const out: SignalChange[] = [];
  for (const f of ["invalidation", "tp1", "tp2", "tp3"] as const) {
    if (link.imported[f] !== link.latest[f]) out.push({ field: f, from: link.imported[f], to: link.latest[f] });
  }
  return out;
}

/** Defensive read of a link stored by another device or an older version. */
export function normalizeLink(raw: unknown): SignalLink | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  const lv = (x: unknown): SignalLevels => {
    const o = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
    return { entryZone: str(o.entryZone), invalidation: str(o.invalidation), tp1: str(o.tp1), tp2: str(o.tp2), tp3: str(o.tp3) };
  };
  const link: SignalLink = {
    id: r.id,
    pair: str(r.pair),
    timeframe: str(r.timeframe),
    imported: lv(r.imported),
    latest: lv(r.latest ?? r.imported),
    status: r.status === "closed" ? "closed" : "open",
    hitLevels: Array.isArray(r.hitLevels) ? r.hitLevels.filter((x): x is string => typeof x === "string").slice(0, 10) : [],
    syncedAt: typeof r.syncedAt === "number" && Number.isFinite(r.syncedAt) ? r.syncedAt : 0,
  };
  if (typeof r.tradeId === "string" && r.tradeId) link.tradeId = r.tradeId;
  return link;
}

// ───────────────────────── Signal -> Trade Plan ─────────────────────────

export type SignalDraft = { ok: true; draft: TradePlanDraft; unreadable: ("entry" | "stop")[] } | { ok: false; error: "short" };

/** A fresh DRAFT plan from a signal. Numbers the app can't read unambiguously are left empty for the user. */
export function signalToDraft(s: PublishedTrade, ctx: { id: string; now?: number }): SignalDraft {
  if (!isLongSignal(s)) return { ok: false, error: "short" };
  const link = linkFromSignal(s, ctx.now);
  const n = numericLevels(link.imported);
  const unreadable: ("entry" | "stop")[] = [];
  if (n.entry === null) unreadable.push("entry");
  if (n.stop === null) unreadable.push("stop");
  return {
    ok: true,
    unreadable,
    draft: {
      id: ctx.id,
      status: "draft",
      pair: s.pair,
      direction: "Long",
      timeframe: s.timeframe ?? "",
      entryZone: s.entryZone ?? "",
      invalidationText: s.invalidation ?? "",
      entry: plain(n.entry),
      invalidation: plain(n.stop),
      tp1: plain(n.tps[0]),
      tp2: plain(n.tps[1]),
      tp3: plain(n.tps[2]),
      reasoning: s.reasoning ?? "",
      signalId: s.id,
      signal: link,
    },
  };
}

/** Explicit "use the official levels" action: copies the latest official numbers into the personal plan. */
export function applyOfficialLevels(d: TradePlanDraft): TradePlanDraft {
  if (!d.signal) return d;
  const n = numericLevels(d.signal.latest);
  return {
    ...d,
    entryZone: d.signal.latest.entryZone,
    invalidationText: d.signal.latest.invalidation,
    entry: n.entry === null ? d.entry : plain(n.entry),
    invalidation: n.stop === null ? d.invalidation : plain(n.stop),
    tp1: n.tps[0] === null ? d.tp1 : plain(n.tps[0]),
    tp2: n.tps[1] === null ? d.tp2 : plain(n.tps[1]),
    tp3: n.tps[2] === null ? d.tp3 : plain(n.tps[2]),
    signal: { ...d.signal, imported: { ...d.signal.latest } },
  };
}

// ───────────────────────── "I Took This Trade" ─────────────────────────

export type TookInput = {
  id: string;
  /** Date the user actually entered (YYYY-MM-DD). */
  date: string;
  /** The price the user actually paid. There is no default: entering it IS the confirmation. */
  entry: number;
  invested?: number | null;
  quantity?: number | null;
  fees?: number | null;
  /** The user's own stop-loss. Defaults to the signal's when it can be read. */
  stop?: number | null;
  now?: number;
};

/** Builds the Journal trade for a confirmed entry. The caller validates it with validateTrade(). */
export function signalToTrade(s: PublishedTrade, c: TookInput): Trade {
  const link = linkFromSignal(s, c.now);
  const n = numericLevels(link.imported);
  const inv = c.invested && c.invested > 0 ? c.invested : null;
  const qty = c.quantity && c.quantity > 0 ? c.quantity : null;
  const size = qty ?? (inv && c.entry > 0 ? inv / c.entry : 0);
  const invested = inv ?? (qty && c.entry > 0 ? qty * c.entry : null);
  const tp = (v: number | null) => (v !== null && v > c.entry ? v : null);
  const tp1 = tp(n.tps[0]);
  const trade: Trade = {
    id: c.id,
    date: c.date,
    pair: s.pair.replace(/[\/\s-]/g, "").toUpperCase(),
    side: "Long",
    entry: c.entry,
    stop: c.stop === undefined ? (n.stop ?? 0) : (c.stop ?? 0),
    target: tp1 ?? 0,
    exit: null,
    size,
    notes: "",
    status: "open",
    exitDate: null,
    tp1,
    tp2: tp(n.tps[1]),
    tp3: tp(n.tps[2]),
    invested,
    fees: c.fees && c.fees > 0 ? c.fees : null,
    strategy: "",
    entryReason: "",
    lessons: "",
    source: "signal",
    signalId: s.id,
    signal: link,
    updatedAt: c.now ?? Date.now(),
  };
  return trade;
}

// ───────────────────────── sync (official data only) ─────────────────────────

export function syncTrades(trades: Trade[], signals: PublishedTrade[], now = Date.now()): Trade[] | null {
  const byId = new Map(signals.map((s) => [s.id, s]));
  let changed = false;
  const next = trades.map((t) => {
    if (!t.signal) return t;
    const s = byId.get(t.signal.id);
    if (!s) return t; // signal left the feed: keep the last known state
    const link = refreshLink(t.signal, s, now);
    if (link === t.signal) return t;
    changed = true;
    return { ...t, signal: link }; // personal fields and updatedAt untouched
  });
  return changed ? next : null;
}

export function syncDraft(draft: TradePlanDraft, signals: PublishedTrade[], now = Date.now()): TradePlanDraft | null {
  if (!draft.signal) return null;
  const s = signals.find((x) => x.id === draft.signal!.id);
  if (!s) return null;
  const link = refreshLink(draft.signal, s, now);
  return link === draft.signal ? null : { ...draft, signal: link };
}

// ───────────────────────── Watch Signal ─────────────────────────

export type Watched = { id: string; pair: string; at: number; status: SignalStatus; hitLevels: string[] };
export type WatchState = { items: Watched[] };
export const MAX_WATCHED = 50;

export function normalizeWatch(raw: unknown): WatchState {
  const arr = (typeof raw === "object" && raw !== null ? (raw as { items?: unknown }).items : null);
  if (!Array.isArray(arr)) return { items: [] };
  const seen = new Set<string>();
  const items: Watched[] = [];
  for (const x of arr) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    items.push({
      id: r.id,
      pair: str(r.pair).slice(0, 30),
      at: typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0,
      status: r.status === "closed" ? "closed" : "open",
      hitLevels: Array.isArray(r.hitLevels) ? r.hitLevels.filter((h): h is string => typeof h === "string").slice(0, 10) : [],
    });
  }
  return { items: items.slice(0, MAX_WATCHED) };
}

export type WatchOp =
  | { op: "watch"; id: string; pair: string; status?: string; hitLevels?: unknown }
  | { op: "unwatch"; id: string }
  | { op: "seen"; id: string; status?: string; hitLevels?: unknown };

export type WatchResult = { ok: true; state: WatchState } | { ok: false; error: "invalid" | "limit" };

export function applyWatchOp(state: WatchState, op: WatchOp, now = Date.now()): WatchResult {
  const id = typeof (op as { id?: unknown }).id === "string" ? (op as { id: string }).id.trim().slice(0, 80) : "";
  if (!id) return { ok: false, error: "invalid" };
  const baseline = (o: { status?: string; hitLevels?: unknown }) => ({
    status: (o.status === "closed" ? "closed" : "open") as SignalStatus,
    hitLevels: Array.isArray(o.hitLevels) ? o.hitLevels.filter((h): h is string => typeof h === "string").slice(0, 10) : [],
  });
  if (op.op === "unwatch") return { ok: true, state: { items: state.items.filter((w) => w.id !== id) } };
  if (op.op === "seen") {
    return { ok: true, state: { items: state.items.map((w) => (w.id === id ? { ...w, ...baseline(op) } : w)) } };
  }
  if (op.op === "watch") {
    if (state.items.some((w) => w.id === id)) return { ok: true, state };
    if (state.items.length >= MAX_WATCHED) return { ok: false, error: "limit" };
    const pair = typeof op.pair === "string" ? op.pair.trim().toUpperCase().slice(0, 30) : "";
    return { ok: true, state: { items: [{ id, pair, at: now, ...baseline(op) }, ...state.items] } };
  }
  return { ok: false, error: "invalid" };
}

/** What changed on a watched signal since the user last looked: new levels hit, and/or closed. */
export function watchUpdates(w: Watched, s: PublishedTrade): { newLevels: string[]; closed: boolean } {
  const hit = s.hitLevels ?? [];
  return { newLevels: hit.filter((h) => !w.hitLevels.includes(h)), closed: s.status === "closed" && w.status !== "closed" };
}
