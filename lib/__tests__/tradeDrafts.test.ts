import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyDraft, type TradePlanDraft } from "@/lib/tradePlan";
import {
  INCOMING_KEY, LEGACY_KEY, MAX_DRAFTS, OWNER_KEY, activeDraft, cleanName, createDraft, deleteDraft, draftTitle, emptyStore,
  openDraft, parseStore, readStore, reconcile, renameDraft, resetActive, saveActive, sortDrafts, storeKey, writeStore,
  type DraftStore, type StorageLike,
} from "@/lib/tradeDrafts";

class Mem implements StorageLike {
  m = new Map<string, string>();
  fail = false;
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.fail) throw new Error("quota"); this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
let n = 0;
const makeId = () => `id${++n}`;
const plan = (o: Partial<TradePlanDraft> = {}): TradePlanDraft => ({ ...emptyDraft, pair: "BTC/USDT", entry: "100", invalidation: "95", tp1: "110", tp2: "120", tp3: "130", reasoning: "r", ...o });
const mk = (s: DraftStore, p: TradePlanDraft, now: number, name = "") => createDraft(s, { plan: p, now, makeId, name }).store;

describe("multiple independent drafts", () => {
  it("creates several drafts, each with its own complete plan", () => {
    let s = emptyStore();
    s = mk(s, plan({ pair: "BTC/USDT", tp3: "130", exitStrategy: "split" }), 1);
    s = mk(s, plan({ pair: "ETH/USDT", tp3: "4000", exitStrategy: "tp3", sizeMode: "usdt", sizeValue: "500" }), 2);
    expect(s.drafts).toHaveLength(2);
    expect(s.drafts[0].plan).toMatchObject({ pair: "BTC/USDT", tp3: "130", exitStrategy: "split" });
    expect(s.drafts[1].plan).toMatchObject({ pair: "ETH/USDT", tp3: "4000", exitStrategy: "tp3", sizeMode: "usdt", sizeValue: "500" });
    expect(s.drafts[0].id).not.toBe(s.drafts[1].id);
    expect(s.drafts[0].plan.id).not.toBe(s.drafts[1].plan.id);
    expect(s.activeId).toBe(s.drafts[1].id);
  });

  it("saving or editing one draft never overwrites another", () => {
    let s = mk(mk(emptyStore(), plan({ pair: "BTC/USDT" }), 1), plan({ pair: "ETH/USDT" }), 2);
    const [a, b] = s.drafts;
    s = openDraft(s, a.id).store;
    s = saveActive(s, { ...activeDraft(s)!.plan, entry: "101", reasoning: "edited A" }, { now: 5, makeId }).store;
    expect(s.drafts.find((d) => d.id === a.id)!.plan).toMatchObject({ entry: "101", reasoning: "edited A" });
    expect(s.drafts.find((d) => d.id === b.id)).toEqual(b); // byte-for-byte untouched, including updatedAt
  });

  it("reopens a draft with exactly the data that was saved", () => {
    let s = mk(mk(emptyStore(), plan({ pair: "BTC/USDT", status: "entered", actualEntry: "99", enteredAt: "2026-11-10" }), 1), plan({ pair: "SOL/USDT" }), 2);
    const first = s.drafts[0];
    s = openDraft(s, first.id).store;
    expect(activeDraft(s)!.plan).toEqual(first.plan);
    expect(activeDraft(s)!.plan.status).toBe("entered");
  });

  it("renames only the named draft, trims and caps the name, and keeps the edit order", () => {
    let s = mk(mk(emptyStore(), plan({ pair: "BTC/USDT" }), 1), plan({ pair: "ETH/USDT" }), 2);
    const [a, b] = s.drafts;
    s = renameDraft(s, a.id, "  Breakout   plan  ", 9).store;
    expect(s.drafts[0].name).toBe("Breakout plan");
    expect(s.drafts[0].updatedAt).toBe(a.updatedAt);
    expect(s.drafts[1]).toEqual(b);
    expect(cleanName("x".repeat(500))).toHaveLength(60);
    expect(draftTitle(s.drafts[0])).toBe("Breakout plan");
    expect(draftTitle(s.drafts[1])).toBe("ETH/USDT"); // unnamed → pair
    expect(renameDraft(s, "nope", "x", 1).error).toBe("missing");
  });

  it("deletes only the chosen draft; deleting the open one opens the most recently edited remaining", () => {
    let s = mk(mk(mk(emptyStore(), plan({ pair: "A/USDT" }), 1), plan({ pair: "B/USDT" }), 2), plan({ pair: "C/USDT" }), 3);
    const [a, b, c] = s.drafts;
    s = saveActive(openDraft(s, a.id).store, { ...a.plan, reasoning: "newest edit" }, { now: 10, makeId }).store;
    s = deleteDraft(s, c.id).store; // not the open one
    expect(s.drafts.map((d) => d.id)).toEqual([a.id, b.id]);
    expect(s.activeId).toBe(a.id);
    s = deleteDraft(s, a.id).store; // the open one
    expect(s.drafts.map((d) => d.id)).toEqual([b.id]);
    expect(s.activeId).toBe(b.id);
    s = deleteDraft(s, b.id).store;
    expect(s).toEqual({ version: 1, activeId: null, drafts: [] });
    expect(deleteDraft(s, "ghost").error).toBe("missing");
  });

  it("with no draft open, the first edit creates one; the draft limit is enforced", () => {
    const first = saveActive(emptyStore(), plan(), { now: 1, makeId });
    expect(first.store.drafts).toHaveLength(1);
    expect(first.store.drafts[0].plan.id).toBeTruthy();
    let s = emptyStore();
    for (let i = 0; i < MAX_DRAFTS; i++) s = mk(s, plan({ pair: `C${i}/USDT` }), i + 1);
    const over = createDraft(s, { now: 99, makeId });
    expect(over.error).toBe("limit");
    expect(over.store.drafts).toHaveLength(MAX_DRAFTS);
  });

  it("clearing the open draft empties only that draft (new plan id, name kept)", () => {
    let s = mk(mk(emptyStore(), plan({ pair: "BTC/USDT" }), 1, "Mine"), plan({ pair: "ETH/USDT" }), 2);
    const [a, b] = s.drafts;
    s = openDraft(s, a.id).store;
    const oldPlanId = a.plan.id;
    s = resetActive(s, { now: 7, makeId }).store;
    const cleared = s.drafts.find((d) => d.id === a.id)!;
    expect(cleared.plan.pair).toBe("");
    expect(cleared.plan.id).not.toBe(oldPlanId);
    expect(cleared.name).toBe("Mine");
    expect(s.drafts.find((d) => d.id === b.id)).toEqual(b);
  });

  it("lists newest-edited first with a stable tie-break", () => {
    const base = { name: "", createdAt: 1, plan: plan() };
    const l = sortDrafts([{ ...base, id: "a", updatedAt: 5 }, { ...base, id: "b", updatedAt: 9 }, { ...base, id: "c", updatedAt: 5 }]);
    expect(l.map((d) => d.id)).toEqual(["b", "c", "a"]);
  });
});

describe("storage, isolation and compatibility", () => {
  it("persists and reloads a user's drafts exactly", () => {
    const st = new Mem();
    const s = mk(mk(emptyStore(), plan({ pair: "BTC/USDT" }), 1, "One"), plan({ pair: "ETH/USDT" }), 2);
    expect(writeStore(st, "user_1", s)).toBe(true);
    const r = readStore(st, "user_1");
    expect(r.corrupt).toBe(false);
    expect(r.store).toEqual(s);
  });

  it("user isolation: another account on the same browser sees none of them", () => {
    const st = new Mem();
    writeStore(st, "user_A", mk(emptyStore(), plan({ pair: "BTC/USDT" }), 1));
    expect(storeKey("user_A")).not.toBe(storeKey("user_B"));
    const b = reconcile(st, "user_B", 5, makeId);
    expect(b.store.drafts).toEqual([]);
    expect(st.getItem(LEGACY_KEY)).toBeNull(); // A's mirror was not adopted, and B's empty store clears it
    expect(readStore(st, "user_A").store.drafts).toHaveLength(1);
  });

  it("migrates an existing single draft (from before this change) into the first draft", () => {
    const st = new Mem();
    const legacy = plan({ pair: "SOL/USDT", entry: "150", id: "plan-legacy", journalId: "j1" });
    st.setItem(LEGACY_KEY, JSON.stringify(legacy));
    const r = reconcile(st, "user_1", 10, makeId);
    expect(r.store.drafts).toHaveLength(1);
    expect(r.store.drafts[0].plan).toMatchObject({ pair: "SOL/USDT", entry: "150", id: "plan-legacy", journalId: "j1" });
    expect(r.store.activeId).toBe(r.store.drafts[0].id);
    expect(st.getItem(OWNER_KEY)).toBe("user_1");
    // running it again does not duplicate
    expect(reconcile(st, "user_1", 11, makeId).store.drafts).toHaveLength(1);
  });

  it("a blank legacy draft is not migrated into an empty draft", () => {
    const st = new Mem();
    st.setItem(LEGACY_KEY, JSON.stringify(emptyDraft));
    expect(reconcile(st, "user_1", 1, makeId).store.drafts).toEqual([]);
  });

  it("a plan handed over by another feature becomes a NEW draft and overwrites nothing", () => {
    const st = new Mem();
    const s = mk(emptyStore(), plan({ pair: "BTC/USDT", reasoning: "keep me" }), 1);
    writeStore(st, "user_1", s);
    // Analyzer hand-off: no id, written through saveDraft (legacy key + incoming marker)
    st.setItem(LEGACY_KEY, JSON.stringify(plan({ pair: "QNT/USDT", reasoning: "from analyzer" })));
    st.setItem(INCOMING_KEY, "1");
    const r = reconcile(st, "user_1", 20, makeId);
    expect(r.store.drafts).toHaveLength(2);
    expect(r.store.drafts.find((d) => d.plan.pair === "BTC/USDT")!.plan.reasoning).toBe("keep me");
    expect(activeDraft(r.store)!.plan).toMatchObject({ pair: "QNT/USDT", reasoning: "from analyzer" });
    expect(activeDraft(r.store)!.plan.id).toBeTruthy();
    expect(st.getItem(INCOMING_KEY)).toBeNull();
  });

  it("an external update of an existing plan (same plan id, e.g. signal sync) updates that draft only", () => {
    const st = new Mem();
    let s = mk(emptyStore(), plan({ pair: "BTC/USDT", id: "p1" }), 1);
    s = mk(s, plan({ pair: "ETH/USDT", id: "p2" }), 2);
    writeStore(st, "user_1", s);
    st.setItem(LEGACY_KEY, JSON.stringify(plan({ pair: "ETH/USDT", id: "p2", tp3: "9999" })));
    st.setItem(INCOMING_KEY, "1");
    const r = reconcile(st, "user_1", 30, makeId);
    expect(r.store.drafts).toHaveLength(2);
    expect(r.store.drafts.find((d) => d.plan.id === "p2")!.plan.tp3).toBe("9999");
    expect(r.store.drafts.find((d) => d.plan.id === "p1")!.plan.tp3).toBe("130");
  });

  it("the active draft is mirrored to the original single-draft key so existing readers keep working", () => {
    const st = new Mem();
    let s = mk(mk(emptyStore(), plan({ pair: "BTC/USDT" }), 1), plan({ pair: "ETH/USDT" }), 2);
    writeStore(st, "u", s);
    expect(JSON.parse(st.getItem(LEGACY_KEY)!).pair).toBe("ETH/USDT");
    s = openDraft(s, s.drafts[0].id).store;
    writeStore(st, "u", s);
    expect(JSON.parse(st.getItem(LEGACY_KEY)!).pair).toBe("BTC/USDT");
    writeStore(st, "u", deleteDraft(deleteDraft(s, s.drafts[0].id).store, s.drafts[1].id).store);
    expect(st.getItem(LEGACY_KEY)).toBeNull();
  });

  it("errors: a refused write is reported, and unreadable data is skipped / backed up, not crashed on", () => {
    const st = new Mem();
    st.fail = true;
    expect(writeStore(st, "u", mk(emptyStore(), plan(), 1))).toBe(false);
    const good = { id: "g", name: "ok", createdAt: 1, updatedAt: 2, plan: plan() };
    const p = parseStore({ activeId: "g", drafts: [good, { id: "bad" }, null, { ...good }, "x"] });
    expect(p.skipped).toBe(4);
    expect(p.store.drafts).toHaveLength(1);
    const st2 = new Mem();
    st2.setItem(storeKey("u"), "{not json");
    const r = readStore(st2, "u");
    expect(r.corrupt).toBe(true);
    expect(r.store.drafts).toEqual([]);
    expect(st2.getItem(`${storeKey("u")}:corrupt-backup`)).toBe("{not json");
    // corrupt data is never overwritten by reconcile
    reconcile(st2, "u", 1, makeId);
    expect(st2.getItem(storeKey("u"))).toBe("{not json");
  });
});

describe("Trade Plan page wiring", () => {
  const page = readFileSync("app/trade-plan/page.tsx", "utf8");
  it("uses the drafts store, with loading / empty / error states in the panel", () => {
    expect(page).toContain("DraftsPanel");
    expect(page).toContain("reconcile(");
    expect(page).not.toMatch(/\bsaveDraft\(|\bloadDraft\(|\bclearDraft\(/);
    const panel = readFileSync("components/tradeplan/DraftsPanel.tsx", "utf8");
    for (const k of ["drafts.loading", "drafts.empty", "drafts.errSave", "drafts.rename", "drafts.confirmDelete", "drafts.new", "drafts.open"]) expect(panel).toContain(k);
  });
  it("keeps the confirmation, execution and Journal workflow code", () => {
    for (const s of ["confirmEntry", "revertDraft", "sendToJournal", "planToTrade(", "confirmPlanIfElite", "saveToAccount", "publishToFeed"]) expect(page).toContain(s);
  });
  it("every language has the draft strings", () => {
    const i18n = readFileSync("lib/i18n.tsx", "utf8");
    expect((i18n.match(/errLimit:/g) ?? []).length).toBe(3);
    expect((i18n.match(/confirmDelete: "[^"]*(draft|مسودة|brouillon)/gi) ?? []).length).toBe(3);
  });
  it("other pages that hand a plan over still use saveDraft (imported as a new draft)", () => {
    expect(readFileSync("components/analyzer/TradePlanPanel.tsx", "utf8")).toContain("saveDraft(draft)");
    expect(readFileSync("lib/tradePlan.ts", "utf8")).toContain("atlas-trading.tradeplan.incoming");
  });
});
