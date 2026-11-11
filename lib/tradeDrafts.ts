// Multiple independent Trade Plan drafts per user (TRADEPLAN-DRAFTS-v1).
//
// Storage: the same place the single draft always lived (this browser's localStorage), but the collection is keyed by
// the signed-in user's id, so two accounts on one browser never see each other's drafts.
//
// Backward compatibility: the original single-draft key (`atlas-trading.tradeplan.v1`) is kept as a MIRROR of the
// active draft. Every existing reader (Journal import, Workflow, Trade Feed, signal sync) keeps working unchanged,
// and every existing writer (Analyzer hand-off, Account "open plan", signal sync) still just writes that key — the
// Trade Plan page then imports it as its own draft instead of overwriting anything (see `reconcile`).

import { emptyDraft, normalizeDraft, type TradePlanDraft } from "@/lib/tradePlan";

export const MAX_DRAFTS = 50;
export const MAX_NAME = 60;

export type StoredDraft = {
  /** Stable id of the saved draft (independent of plan.id, which links the plan to a Journal trade). */
  id: string;
  /** User-chosen name. Empty = show the pair (or "Untitled"). */
  name: string;
  createdAt: number;
  updatedAt: number;
  plan: TradePlanDraft;
};
export type DraftStore = { version: 1; activeId: string | null; drafts: StoredDraft[] };

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const LEGACY_KEY = "atlas-trading.tradeplan.v1";
export const OWNER_KEY = "atlas-trading.tradeplan.owner";
export const INCOMING_KEY = "atlas-trading.tradeplan.incoming";
export const storeKey = (userId: string) => `atlas-trading.tradeplan.drafts.v2:${userId}`;
const backupKey = (userId: string) => `${storeKey(userId)}:corrupt-backup`;

export const emptyStore = (): DraftStore => ({ version: 1, activeId: null, drafts: [] });

export const cleanName = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "");

/** True when the plan has anything the user typed or imported (an untouched blank plan is not worth a draft). */
export function hasContent(p: TradePlanDraft): boolean {
  const blank = emptyDraft;
  return (
    p.pair.trim() !== "" ||
    (["entryZone", "invalidationText", "entry", "invalidation", "tp1", "tp2", "tp3", "reasoning"] as const).some((k) => p[k].trim() !== blank[k]) ||
    !!p.signal ||
    !!p.signalId
  );
}

/** Newest-edited first; ties broken by creation time then id, so the order is stable. */
export function sortDrafts(drafts: readonly StoredDraft[]): StoredDraft[] {
  return [...drafts].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

export const draftTitle = (d: StoredDraft) => d.name || d.plan.pair.trim().toUpperCase();

export function activeDraft(store: DraftStore): StoredDraft | null {
  return store.drafts.find((d) => d.id === store.activeId) ?? null;
}

// ───────────────────────── pure operations (each returns a new store) ─────────────────────────

export type OpResult = { store: DraftStore; error?: "limit" | "missing" };

const withPlanId = (plan: TradePlanDraft, makeId: () => string): TradePlanDraft => (plan.id ? plan : { ...plan, id: makeId() });

/** Creates a new draft (blank unless a plan is given) and makes it the active one. */
export function createDraft(store: DraftStore, opts: { plan?: TradePlanDraft; name?: string; now: number; makeId: () => string }): OpResult {
  if (store.drafts.length >= MAX_DRAFTS) return { store, error: "limit" };
  const plan = withPlanId({ ...emptyDraft, ...(opts.plan ?? {}) }, opts.makeId);
  const d: StoredDraft = { id: opts.makeId(), name: cleanName(opts.name), createdAt: opts.now, updatedAt: opts.now, plan };
  return { store: { ...store, activeId: d.id, drafts: [...store.drafts, d] } };
}

/**
 * Saves the plan being edited. Only the draft that holds this plan changes — found by its active id, never by
 * position — so editing one draft can never touch another. With no active draft, one is created.
 */
export function saveActive(store: DraftStore, plan: TradePlanDraft, opts: { now: number; makeId: () => string }): OpResult {
  const withId = withPlanId(plan, opts.makeId);
  const cur = activeDraft(store);
  if (!cur) return createDraft(store, { plan: withId, now: opts.now, makeId: opts.makeId });
  return {
    store: { ...store, drafts: store.drafts.map((d) => (d.id === cur.id ? { ...d, plan: withId, updatedAt: opts.now } : d)) },
  };
}

export function openDraft(store: DraftStore, id: string): OpResult {
  return store.drafts.some((d) => d.id === id) ? { store: { ...store, activeId: id } } : { store, error: "missing" };
}

export function renameDraft(store: DraftStore, id: string, name: string, now: number): OpResult {
  if (!store.drafts.some((d) => d.id === id)) return { store, error: "missing" };
  // Renaming is not an edit of the plan: updatedAt (and so the list order) stays as it was.
  void now;
  return { store: { ...store, drafts: store.drafts.map((d) => (d.id === id ? { ...d, name: cleanName(name) } : d)) } };
}

/** Deletes one draft. If it was the active one, the most recently edited remaining draft becomes active (or none). */
export function deleteDraft(store: DraftStore, id: string): OpResult {
  if (!store.drafts.some((d) => d.id === id)) return { store, error: "missing" };
  const drafts = store.drafts.filter((d) => d.id !== id);
  const activeId = store.activeId === id ? (sortDrafts(drafts)[0]?.id ?? null) : store.activeId;
  return { store: { ...store, drafts, activeId } };
}

/** Empties the content of one draft in place (the draft keeps its name; the plan gets a fresh id so it is a new plan). */
export function resetActive(store: DraftStore, opts: { now: number; makeId: () => string }): OpResult {
  const cur = activeDraft(store);
  if (!cur) return { store };
  return saveActive(store, { ...emptyDraft, id: opts.makeId() }, opts);
}

// ───────────────────────── parsing ─────────────────────────

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);

/** Tolerant: drafts that cannot be read are skipped (and counted) instead of failing the whole collection. */
export function parseStore(raw: unknown): { store: DraftStore; skipped: number } {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.drafts) ? r.drafts : [];
  const seen = new Set<string>();
  const drafts: StoredDraft[] = [];
  let skipped = 0;
  for (const x of list) {
    const o = (typeof x === "object" && x !== null ? x : null) as Record<string, unknown> | null;
    if (!o || typeof o.id !== "string" || !o.id || seen.has(o.id) || typeof o.plan !== "object" || o.plan === null) {
      skipped++;
      continue;
    }
    seen.add(o.id);
    const created = num(o.createdAt, 1);
    drafts.push({ id: o.id, name: cleanName(o.name), createdAt: created, updatedAt: num(o.updatedAt, created), plan: normalizeDraft(o.plan) });
  }
  const activeId = typeof r.activeId === "string" && seen.has(r.activeId) ? r.activeId : null;
  return { store: { version: 1, activeId, drafts: drafts.slice(0, MAX_DRAFTS) }, skipped };
}

// ───────────────────────── storage ─────────────────────────

export type ReadResult = { store: DraftStore; skipped: number; corrupt: boolean };

export function readStore(storage: StorageLike, userId: string): ReadResult {
  let raw: string | null = null;
  try {
    raw = storage.getItem(storeKey(userId));
  } catch {
    return { store: emptyStore(), skipped: 0, corrupt: true };
  }
  if (!raw) return { store: emptyStore(), skipped: 0, corrupt: false };
  try {
    const { store, skipped } = parseStore(JSON.parse(raw));
    return { store, skipped, corrupt: false };
  } catch {
    // Unreadable: keep a copy before anything can overwrite it, and start empty.
    try {
      if (!storage.getItem(backupKey(userId))) storage.setItem(backupKey(userId), raw);
    } catch {
      /* best effort */
    }
    return { store: emptyStore(), skipped: 0, corrupt: true };
  }
}

/** Writes the collection AND the active-draft mirror. Returns false if the browser refused the write. */
export function writeStore(storage: StorageLike, userId: string, store: DraftStore): boolean {
  try {
    storage.setItem(storeKey(userId), JSON.stringify(store));
    const active = activeDraft(store);
    if (active) storage.setItem(LEGACY_KEY, JSON.stringify(active.plan));
    else storage.removeItem(LEGACY_KEY);
    storage.setItem(OWNER_KEY, userId);
    return true;
  } catch {
    return false;
  }
}

export type ReconcileResult = { store: DraftStore; skipped: number; corrupt: boolean; error?: "limit" };

/**
 * Brings the collection and the legacy single-draft key together for this user. Called when the page opens.
 *  - Legacy key written by an external feature (Analyzer hand-off, Account, signal sync set the "incoming" marker) or
 *    by a version from before drafts existed (no owner tag) → imported: it updates the draft holding the same plan id,
 *    otherwise it becomes a NEW draft. Existing drafts are never overwritten by an unrelated plan.
 *  - Legacy key that belongs to another user (owner tag differs) → ignored, never imported.
 */
export function reconcile(storage: StorageLike, userId: string, now: number, makeId: () => string): ReconcileResult {
  const read = readStore(storage, userId);
  let store = read.store;
  let error: ReconcileResult["error"];
  let rawLegacy: string | null = null;
  let owner: string | null = null;
  let incoming = false;
  try {
    rawLegacy = storage.getItem(LEGACY_KEY);
    owner = storage.getItem(OWNER_KEY);
    incoming = storage.getItem(INCOMING_KEY) === "1";
  } catch {
    /* treated as nothing to import */
  }
  if (rawLegacy && !read.corrupt && (incoming || owner === null)) {
    let plan: TradePlanDraft | null = null;
    try {
      plan = normalizeDraft(JSON.parse(rawLegacy));
    } catch {
      plan = null;
    }
    if (plan && hasContent(plan)) {
      const match = plan.id ? store.drafts.find((d) => d.plan.id === plan!.id) : undefined;
      if (match) {
        store = { ...store, activeId: match.id, drafts: store.drafts.map((d) => (d.id === match.id ? { ...d, plan: plan!, updatedAt: now } : d)) };
      } else {
        const r = createDraft(store, { plan, now, makeId });
        store = r.store;
        error = r.error === "limit" ? "limit" : undefined;
      }
    }
  }
  if (!store.activeId && store.drafts.length) store = { ...store, activeId: sortDrafts(store.drafts)[0].id };
  try {
    storage.removeItem(INCOMING_KEY);
  } catch {
    /* best effort */
  }
  if (!read.corrupt) writeStore(storage, userId, store);
  return { store, skipped: read.skipped, corrupt: read.corrupt, error };
}
