"use client";

// Browser-side watchlist store shared by the star buttons and the Watchlist
// page. Signed out: the list lives in localStorage. Signed in: the account
// copy (Redis via /api/me/watchlist) is the source of truth; whatever was
// saved while signed out is merged into it once, without duplicates, then
// removed from the browser. Changes apply instantly and are rolled back if
// the server refuses or cannot be reached.
import { applyOp, emptyState, normalizeState, type WatchOp, type WatchState } from "@/lib/watchlist";
import { watchlistLimit } from "@/lib/watchlistConfig";

const LOCAL_KEY = "atlas-trading.watchlist.v1";
const REFETCH_MIN_MS = 20_000;

export type StoreState = WatchState & {
  limit: number;
  plan: string;
  signedIn: boolean;
  ready: boolean; // first load for the current auth state finished
  syncError: boolean; // last save/load against the account failed
  mergedDropped: number; // browser coins that did not fit the limit when merging
};
export type AddResult = { ok: true } | { ok: false; reason: "limit" | "invalid"; limit: number; plan: string };
type LimitInfo = { limit: number; plan: string };

const initial = (): StoreState => ({
  ...emptyState(), limit: watchlistLimit("free"), plan: "free", signedIn: false, ready: false, syncError: false, mergedDropped: 0,
});

let state: StoreState = initial();
let attachedFor: string | null | undefined;
let lastFetch = 0;
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
const limitListeners = new Set<(i: LimitInfo) => void>();

export const getState = (): StoreState => state;
export const getServerState = (): StoreState => SERVER_STATE;
const SERVER_STATE = initial();

function set(next: Partial<StoreState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}
export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
/** Called when the server (not the local check) says the plan limit is reached. */
export function onServerLimit(cb: (i: LimitInfo) => void): void {
  limitListeners.add(cb);
}
export function dismissMergeNotice() {
  set({ mergedDropped: 0 });
}

// ---- localStorage (signed out) ------------------------------------------

function readLocal(): WatchState {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}
function writeLocal(s: WatchState) {
  try {
    if (s.items.length === 0) window.localStorage.removeItem(LOCAL_KEY);
    else window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ items: s.items, seen: s.seen }));
  } catch {
    /* storage unavailable: the list just will not persist */
  }
}
function clearLocal() {
  try {
    window.localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

// ---- server -------------------------------------------------------------

type Reply = { items?: unknown; seen?: unknown; limit?: unknown; plan?: unknown; dropped?: unknown };

async function call(op?: WatchOp): Promise<{ status: number; data: Reply } | null> {
  try {
    const res = await fetch("/api/me/watchlist", {
      method: op ? "POST" : "GET",
      cache: "no-store",
      headers: op ? { "Content-Type": "application/json" } : undefined,
      body: op ? JSON.stringify(op) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Reply;
    return { status: res.status, data };
  } catch {
    return null;
  }
}

function adopt(data: Reply, extra: Partial<StoreState> = {}) {
  const s = normalizeState(data);
  set({
    items: s.items,
    seen: s.seen,
    limit: typeof data.limit === "number" ? data.limit : state.limit,
    plan: typeof data.plan === "string" ? data.plan : state.plan,
    ...extra,
  });
}

/** Tell the store who is signed in (null = nobody). Safe to call repeatedly. */
export function attach(userId: string | null): void {
  if (typeof window === "undefined" || attachedFor === userId) return;
  attachedFor = userId;
  lastFetch = Date.now();
  if (!userId) {
    const local = readLocal();
    set({ ...local, limit: watchlistLimit("free"), plan: "free", signedIn: false, ready: true, syncError: false, mergedDropped: 0 });
    return;
  }
  // Never show another account's (or the browser's) list while this one loads.
  set({ ...emptyState(), signedIn: true, ready: false, syncError: false, mergedDropped: 0 });
  queue = queue.then(async () => {
    if (attachedFor !== userId) return;
    const local = readLocal();
    const first = local.items.length
      ? await call({ op: "merge", symbols: local.items.map((i) => i.symbol) })
      : await call();
    if (attachedFor !== userId) return;
    if (!first || first.status >= 400) {
      set({ ready: true, syncError: true });
      return;
    }
    if (local.items.length) clearLocal();
    adopt(first.data, { ready: true, syncError: false, mergedDropped: typeof first.data.dropped === "number" ? first.data.dropped : 0 });
  });
}

/** Re-read the account copy (changes from another device or tab). Throttled unless forced. */
export function refresh(force = false): Promise<void> {
  if (!state.signedIn || !state.ready) return Promise.resolve();
  if (!force && Date.now() - lastFetch < REFETCH_MIN_MS) return Promise.resolve();
  lastFetch = Date.now();
  const who = attachedFor;
  const p = queue.then(async () => {
    const r = await call();
    if (attachedFor !== who || !r || r.status >= 400) return;
    adopt(r.data, { syncError: false });
  });
  queue = p.catch(() => undefined);
  return p;
}

function rollback(op: WatchOp, before: WatchState) {
  if (op.op !== "add" && op.op !== "remove") return; // "seen" corrects itself on the next sync
  const symbol = (op as { symbol: unknown }).symbol;
  const sym = applyOp(emptyState(), { op: "add", symbol }, 1);
  if (!sym.ok) return;
  const s = sym.state.items[0].symbol;
  if (op.op === "add") {
    set({ items: state.items.filter((i) => i.symbol !== s) });
    return;
  }
  const orig = before.items.find((i) => i.symbol === s);
  if (!orig || state.items.some((i) => i.symbol === s)) return;
  set({ items: [...state.items, orig], seen: before.seen[s] ? { ...state.seen, [s]: before.seen[s] } : state.seen });
}

function change(op: WatchOp): AddResult {
  const before: WatchState = { items: state.items, seen: state.seen };
  const local = applyOp(before, op, state.limit);
  if (!local.ok) return { ok: false, reason: local.error, limit: state.limit, plan: state.plan };
  set({ items: local.state.items, seen: local.state.seen });
  if (!state.signedIn) {
    writeLocal(local.state);
    return { ok: true };
  }
  const who = attachedFor;
  const run = async () => {
    const r = await call(op);
    if (attachedFor !== who) return;
    if (r && r.status < 400) {
      adopt(r.data, { syncError: false });
    } else if (r && r.status === 409) {
      adopt(r.data, { syncError: false }); // the account copy wins
      const info = { limit: typeof r.data.limit === "number" ? r.data.limit : state.limit, plan: typeof r.data.plan === "string" ? r.data.plan : state.plan };
      for (const cb of limitListeners) cb(info);
    } else {
      rollback(op, before);
      set({ syncError: true });
    }
  };
  queue = queue.then(run, run);
  return { ok: true };
}

export const addSymbol = (symbol: string): AddResult => change({ op: "add", symbol });
export const removeSymbol = (symbol: string): void => void change({ op: "remove", symbol });
export function saveSeen(seen: Record<string, string>): void {
  if (Object.keys(seen).length) void change({ op: "seen", seen });
}
