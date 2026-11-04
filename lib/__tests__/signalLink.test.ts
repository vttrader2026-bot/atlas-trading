import { describe, expect, it } from "vitest";
import {
  MAX_WATCHED, applyOfficialLevels, applyWatchOp, linkFromSignal, normalizeLink, normalizeWatch, numbersIn, numericLevels, priceOf,
  refreshLink, signalChanges, signalToDraft, signalToTrade, syncDraft, syncTrades, watchUpdates, zoneOf, isLiveSignal,
} from "@/lib/signalLink";
import { normalizeDraft } from "@/lib/tradePlan";
import { planToTrade } from "@/lib/planBridge";
import { realizedPnl, unrealizedPnl, validateTrade, type Trade } from "@/lib/journal";
import type { PublishedTrade } from "@/lib/tradeFeed";

const sig = (o: Partial<PublishedTrade> = {}): PublishedTrade => ({
  id: "sig-1", createdAt: 1, pair: "SOL/USDT", direction: "Long", timeframe: "4H", entryZone: "99 - 101", invalidation: "95",
  tp1: "110", tp2: "120", tp3: "130", reasoning: "Range reclaim", tradeId: "T075", status: "open", hitLevels: [], ...o,
});

describe("reading published text", () => {
  it("ignores timeframe tokens and thousands separators", () => {
    expect(numbersIn("4H close below 60,500")).toEqual([60500]);
    expect(numbersIn("1D 0.0123")).toEqual([0.0123]);
    expect(priceOf("Below 60,500 or 59,800")).toBeNull(); // ambiguous: the user must choose
    expect(priceOf("no number")).toBeNull();
    expect(zoneOf("61,200 - 61,800")).toEqual({ low: 61200, high: 61800 });
    expect(zoneOf("62000")).toEqual({ low: 62000, high: 62000 });
    expect(zoneOf("1 2 3")).toBeNull();
  });
  it("plans from the top of the zone (conservative)", () => {
    expect(numericLevels(linkFromSignal(sig()).imported)).toMatchObject({ entry: 101, stop: 95, tps: [110, 120, 130] });
  });
});

describe("Create Trade Plan (signal -> draft)", () => {
  it("imports pair, entry, stop, targets, timeframe and the Signal ID as an unconfirmed draft", () => {
    const r = signalToDraft(sig(), { id: "plan-1", now: 5 });
    if (!r.ok) throw new Error();
    expect(r.draft).toMatchObject({ id: "plan-1", status: "draft", pair: "SOL/USDT", direction: "Long", timeframe: "4H", entry: "101", invalidation: "95", tp1: "110", tp2: "120", tp3: "130", signalId: "sig-1", entryZone: "99 - 101", invalidationText: "95" });
    expect(r.draft.signal).toMatchObject({ id: "sig-1", tradeId: "T075", status: "open" });
    expect(r.draft.enteredAt).toBeUndefined();
    expect(r.unreadable).toEqual([]);
  });
  it("leaves unreadable numbers empty instead of guessing", () => {
    const r = signalToDraft(sig({ entryZone: "wait for dip", invalidation: "below 60,500 or 59,800" }), { id: "p" });
    if (!r.ok) throw new Error();
    expect(r.draft.entry).toBe("");
    expect(r.draft.invalidation).toBe("");
    expect(r.unreadable).toEqual(["entry", "stop"]);
  });
  it("spot only: a Short signal cannot become a plan", () => {
    expect(signalToDraft(sig({ direction: "Short" }), { id: "p" })).toEqual({ ok: false, error: "short" });
  });
  it("a signal draft survives storage normalization with its link", () => {
    const r = signalToDraft(sig(), { id: "p" });
    if (!r.ok) throw new Error();
    expect(normalizeDraft(JSON.parse(JSON.stringify(r.draft)))).toEqual(r.draft);
  });
  it("the plan stays a draft: nothing can be sent to the journal until entry is confirmed", () => {
    const r = signalToDraft(sig(), { id: "p" });
    if (!r.ok) throw new Error();
    expect(planToTrade(r.draft, { id: "t", today: "2026-11-03" })).toEqual({ ok: false, error: "notEntered" });
    const entered = { ...r.draft, status: "entered" as const, actualEntry: "100.5", enteredAt: "2026-11-03", balance: "1000", riskPct: "1" };
    const t = planToTrade(entered, { id: "t", today: "2026-11-03" });
    if (!t.ok) throw new Error(t.error);
    expect(t.trade).toMatchObject({ signalId: "sig-1", planId: "p", source: "plan", entry: 100.5, status: "open" });
    expect(t.trade.signal?.id).toBe("sig-1");
    expect(validateTrade(t.trade)).toEqual([]);
  });
});

describe("I Took This Trade (confirmed entry)", () => {
  const took = (o = {}) => signalToTrade(sig(), { id: "j1", date: "2026-11-03", entry: 100, invested: 200, fees: 1, now: 9, ...o });
  it("builds an Open spot long from the user's real fill, linked by Signal ID", () => {
    const t = took();
    expect(t).toMatchObject({ id: "j1", side: "Long", status: "open", entry: 100, stop: 95, tp1: 110, tp2: 120, tp3: 130, exit: null, invested: 200, size: 2, fees: 1, source: "signal", signalId: "sig-1" });
    expect(validateTrade(t)).toEqual([]);
  });
  it("the user's own stop wins over the signal's, and can be cleared", () => {
    expect(took({ stop: 97 }).stop).toBe(97);
    expect(took({ stop: null }).stop).toBe(0);
  });
  it("quantity-only input derives the invested amount", () => {
    const t = took({ invested: null, quantity: 3 });
    expect(t.size).toBe(3);
    expect(t.invested).toBe(300);
  });
  it("without an amount the trade is invalid, so it cannot be saved", () => {
    expect(validateTrade(took({ invested: null })).map((i) => i.code)).toContain("quantity");
    expect(validateTrade(took({ entry: 0 })).map((i) => i.code)).toContain("entry");
  });
  it("targets at or below the actual fill are dropped, not kept as bad data", () => {
    expect(took({ entry: 125 }).tp1).toBeNull();
    expect(validateTrade(took({ entry: 125, stop: 120 }))).toEqual([]);
  });
  it("PnL uses the user's entry/exit/fees, not the signal's levels", () => {
    const t = { ...took(), status: "closed" as const, exit: 115, exitDate: "2026-11-04" };
    expect(realizedPnl(t)).toBeCloseTo((115 - 100) * 2 - 1, 10); // 29
    expect(unrealizedPnl(took(), 104)).toBeCloseTo(7, 10);
  });
});

describe("synchronization never overwrites personal data", () => {
  const base = (): Trade => ({ ...signalToTrade(sig(), { id: "j1", date: "2026-11-03", entry: 100, invested: 200, stop: 97, fees: 1, now: 1 }), notes: "my note", lessons: "my lesson", updatedAt: 111 });
  it("refreshes status, hit levels and official SL/TP only", () => {
    const updated = sig({ invalidation: "98", tp1: "112", status: "open", hitLevels: ["TP1"] });
    const out = syncTrades([base()], [updated], 50);
    expect(out).not.toBeNull();
    const t = (out as Trade[])[0];
    expect(t.signal).toMatchObject({ hitLevels: ["TP1"], syncedAt: 50 });
    expect(t.signal?.latest).toMatchObject({ invalidation: "98", tp1: "112" });
    expect(t.signal?.imported).toMatchObject({ invalidation: "95", tp1: "110" });
    expect(signalChanges(t.signal!)).toEqual([{ field: "invalidation", from: "95", to: "98" }, { field: "tp1", from: "110", to: "112" }]);
  });
  it("personal entry, exit, stop, targets, size, fees, notes and updatedAt stay exactly as the user left them", () => {
    const mine: Trade = { ...base(), exit: 109, exitDate: "2026-11-05", status: "closed", tp1: 108 };
    const out = syncTrades([mine], [sig({ invalidation: "99", tp1: "115", hitLevels: ["SL"], status: "closed" })], 50) as Trade[];
    const { signal: _a, ...after } = out[0];
    const { signal: _b, ...before } = mine;
    void _a; void _b;
    expect(after).toEqual(before);
    expect(out[0].signal?.status).toBe("closed");
  });
  it("returns null (nothing to save) when nothing official changed, and ignores signals it can't find", () => {
    expect(syncTrades([base()], [sig()], 50)).toBeNull();
    expect(syncTrades([base()], [], 50)).toBeNull();
    expect(syncTrades([{ ...base(), signal: undefined, signalId: undefined }], [sig({ hitLevels: ["TP1"] })])).toBeNull();
  });
  it("only touches the trade linked to the updated signal", () => {
    const other = { ...base(), id: "j2", signal: linkFromSignal(sig({ id: "sig-2" }), 1), signalId: "sig-2" };
    const out = syncTrades([base(), other], [sig({ hitLevels: ["TP1"] })], 50) as Trade[];
    expect(out[0].signal?.hitLevels).toEqual(["TP1"]);
    expect(out[1].signal?.hitLevels).toEqual([]);
  });
  it("syncs a plan draft's link without touching the user's numbers; applying official levels is explicit", () => {
    const r = signalToDraft(sig(), { id: "p", now: 1 });
    if (!r.ok) throw new Error();
    const mine = { ...r.draft, invalidation: "96", entry: "100", reasoning: "mine" };
    const out = syncDraft(mine, [sig({ invalidation: "98", hitLevels: ["TP1"] })], 9);
    expect(out).toMatchObject({ invalidation: "96", entry: "100", reasoning: "mine" });
    expect(out?.signal?.latest.invalidation).toBe("98");
    const used = applyOfficialLevels(out!);
    expect(used.invalidation).toBe("98");
    expect(used.signal?.imported.invalidation).toBe("98");
    expect(signalChanges(used.signal!)).toEqual([]);
    expect(syncDraft({ ...mine, signal: undefined, signalId: undefined }, [sig()])).toBeNull();
  });
  it("refreshLink returns the same object when unchanged", () => {
    const l = linkFromSignal(sig(), 1);
    expect(refreshLink(l, sig(), 2)).toBe(l);
  });
  it("normalizeLink rejects junk and repairs partial data", () => {
    expect(normalizeLink(null)).toBeNull();
    expect(normalizeLink({ id: 5 })).toBeNull();
    expect(normalizeLink({ id: "x", hitLevels: ["TP1", 3] })).toMatchObject({ id: "x", hitLevels: ["TP1"], status: "open" });
  });
});

describe("signal state", () => {
  it("a closed or stopped signal can no longer be entered", () => {
    expect(isLiveSignal(sig())).toBe(true);
    expect(isLiveSignal(sig({ status: "closed" }))).toBe(false);
    expect(isLiveSignal(sig({ hitLevels: ["TP1", "SL"] }))).toBe(false);
  });
});

describe("Watch Signal", () => {
  it("watch / unwatch without creating anything else", () => {
    let s = normalizeWatch(null);
    const w = applyWatchOp(s, { op: "watch", id: "sig-1", pair: "sol/usdt", status: "open", hitLevels: ["TP1"] }, 7);
    if (!w.ok) throw new Error();
    s = w.state;
    expect(s.items).toEqual([{ id: "sig-1", pair: "SOL/USDT", at: 7, status: "open", hitLevels: ["TP1"] }]);
    const again = applyWatchOp(s, { op: "watch", id: "sig-1", pair: "x" }, 8);
    expect(again.ok && again.state.items).toHaveLength(1);
    const u = applyWatchOp(s, { op: "unwatch", id: "sig-1" });
    expect(u.ok && u.state.items).toEqual([]);
  });
  it("reports only what is new since the user last looked", () => {
    const w = { id: "sig-1", pair: "SOL/USDT", at: 1, status: "open" as const, hitLevels: ["TP1"] };
    expect(watchUpdates(w, sig({ hitLevels: ["TP1"] }))).toEqual({ newLevels: [], closed: false });
    expect(watchUpdates(w, sig({ hitLevels: ["TP1", "TP2"], status: "closed" }))).toEqual({ newLevels: ["TP2"], closed: true });
    const seen = applyWatchOp({ items: [w] }, { op: "seen", id: "sig-1", status: "closed", hitLevels: ["TP1", "TP2"] });
    expect(seen.ok && seen.state.items[0]).toMatchObject({ status: "closed", hitLevels: ["TP1", "TP2"] });
  });
  it("is capped, rejects empty ids and tolerates corrupt stored data", () => {
    let s = normalizeWatch(null);
    for (let i = 0; i < MAX_WATCHED; i++) { const r = applyWatchOp(s, { op: "watch", id: `s${i}`, pair: "A" }); if (!r.ok) throw new Error(); s = r.state; }
    expect(applyWatchOp(s, { op: "watch", id: "extra", pair: "A" })).toEqual({ ok: false, error: "limit" });
    expect(applyWatchOp(s, { op: "watch", id: "  ", pair: "A" })).toEqual({ ok: false, error: "invalid" });
    expect(normalizeWatch({ items: [{ id: "a" }, { id: "a" }, 5, null, { id: 3 }] }).items).toHaveLength(1);
    expect(normalizeWatch("junk")).toEqual({ items: [] });
  });
});
