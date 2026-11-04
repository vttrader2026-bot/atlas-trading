// ELITE-CONFIRM-v1 REGRESSION: no route may create a personal Journal trade from an ELITE signal without the
// server-side fresh-price entry-zone check and duplicate guard. Real routes (confirm-trade, journal, trade-feed),
// real client helper (confirmPlanIfElite) and real Trade Plan maths; only Clerk, Upstash, Binance and the browser are fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  userId: "member_a" as string | null,
  plans: {} as Record<string, unknown>,
  feed: [] as Record<string, unknown>[],
  kv: new Map<string, unknown>(),
  hashes: new Map<string, Map<string, unknown>>(),
  ticker: vi.fn(),
  lrangeCalls: 0,
  ls: new Map<string, string>(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: h.userId }),
  clerkClient: async () => ({ users: { getUser: async (id: string) => ({ privateMetadata: { plan: h.plans[id] } }) } }),
}));
const fakeRedis = () => ({
  lrange: async () => { h.lrangeCalls++; return structuredClone(h.feed); },
  get: async (k: string) => (h.kv.has(k) ? structuredClone(h.kv.get(k)) : null),
  set: async (k: string, v: unknown) => { h.kv.set(k, structuredClone(v)); return "OK"; },
  hget: async (k: string, f: string) => structuredClone(h.hashes.get(k)?.get(f) ?? null),
  hgetall: async (k: string) => { const m = h.hashes.get(k); return m ? structuredClone(Object.fromEntries(m)) : null; },
  hsetnx: async (k: string, f: string, v: unknown) => {
    const m = h.hashes.get(k) ?? new Map();
    h.hashes.set(k, m);
    if (m.has(f)) return 0;
    m.set(f, structuredClone(v));
    return 1;
  },
  hdel: async (k: string, f: string) => (h.hashes.get(k)?.delete(f) ? 1 : 0),
});
vi.mock("@/lib/userStore", () => ({
  getRedis: () => fakeRedis(),
  requireUser: async () => {
    const { NextResponse } = await import("next/server");
    return h.userId ? { userId: h.userId, redis: fakeRedis() } : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  },
}));
vi.mock("@upstash/redis", () => ({ Redis: class { async lrange() { return structuredClone(h.feed); } } }));
vi.mock("@/lib/binance", () => ({ getTicker24h: (s: string) => h.ticker(s) }));
vi.mock("@/lib/push", () => ({ notifyTradeSubscribers: vi.fn(), notifyTpSlSubscribers: vi.fn(), notifyTradeClosedSubscribers: vi.fn() }));

import { GET as feedGET } from "@/app/api/trade-feed/route";
import { POST as confirmPOST } from "@/app/api/me/confirm-trade/route";
import { PUT as journalPUT } from "@/app/api/me/journal/route";
import { confirmPlanIfElite, outcomeText } from "@/lib/eliteConfirmClient";
import { planToTrade } from "@/lib/planBridge";
import { signalToDraft } from "@/lib/signalLink";
import { loadTrades, saveTrades } from "@/lib/journal";
import type { PublishedTrade } from "@/lib/tradeFeed";
import type { TradePlanDraft } from "@/lib/tradePlan";

const sig = (over: Record<string, unknown> = {}): PublishedTrade =>
  ({ id: "sig-elite", createdAt: 1, pair: "SOL/USDT", direction: "Long", timeframe: "4H", entryZone: "100 - 110", invalidation: "95", tp1: "120", tp2: "130", tp3: "140", reasoning: "r", status: "open", tier: "elite", ...over }) as PublishedTrade;
const price = (p: number, ageMs = 0) => ({ lastPrice: String(p), closeTime: Date.now() - ageMs });
const journalOf = (u = "member_a") => (h.kv.get(`user:${u}:journal`) as Array<Record<string, unknown>> | undefined) ?? [];
const confirmations = (u = "member_a") => h.hashes.get(`user:${u}:confirmations`);
const putJournal = (trades: unknown[]) => journalPUT(new Request("http://x/api/me/journal", { method: "PUT", body: JSON.stringify({ trades }) }));

/** A plan the member built from `signal`, entered at `actualEntry`. Built exactly like the app does. */
function enteredPlan(signal: PublishedTrade, actualEntry = "105", own: { invalidation: string; tp1: string } = { invalidation: "98", tp1: "125" }): TradePlanDraft {
  const r = signalToDraft(signal, { id: "plan-1" });
  if (!r.ok) throw new Error("short");
  return { ...r.draft, status: "entered", actualEntry, enteredAt: "2026-11-04", balance: "1000", riskPct: "1", ...own };
}
const planTrade = (d: TradePlanDraft) => {
  const r = planToTrade(d, { id: "local-1", today: "2026-11-04" });
  if (!r.ok) throw new Error(String(r.error));
  return r.trade;
};

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = "https://fake";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake";
  h.userId = "member_a";
  h.plans = { member_a: "elite", free_user: "free" };
  h.feed = [sig(), sig({ id: "sig-free", tier: "free", tradeId: "T9", entryZone: "10 - 11" })];
  h.kv.clear();
  h.hashes.clear();
  h.lrangeCalls = 0;
  h.ls.clear();
  h.ticker.mockReset();
  h.ticker.mockResolvedValue(price(105));
  vi.stubGlobal("window", {
    localStorage: { getItem: (k: string) => h.ls.get(k) ?? null, setItem: (k: string, v: string) => void h.ls.set(k, v), removeItem: (k: string) => void h.ls.delete(k) },
    dispatchEvent: () => true,
  });
  // The browser's fetch, wired straight to the real route handlers.
  vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => {
    const u = String(url);
    if (u.endsWith("/api/trade-feed")) return feedGET(new Request("http://x/api/trade-feed"));
    if (u.endsWith("/api/me/confirm-trade")) return confirmPOST(new Request("http://x" + u, { method: "POST", body: init?.body }));
    throw new Error("unexpected fetch " + u);
  });
});

describe("Trade Plan -> Send to Journal for an ELITE signal", () => {
  it("creates the Journal trade through the server when the fresh price is inside the zone, keeping the plan's own stop and targets", async () => {
    const draft = enteredPlan(sig());
    const out = await confirmPlanIfElite(draft, planTrade(draft));
    expect(out?.ok).toBe(true);
    const [trade] = journalOf();
    expect(journalOf()).toHaveLength(1);
    expect(trade).toMatchObject({ pair: "SOLUSDT", signalId: "sig-elite", source: "plan", planId: "plan-1", entry: 105, stop: 98, tp1: 125, status: "open" });
    expect(trade.invested as number).toBeGreaterThan(0);
    expect(confirmations()!.get("sig-elite")).toMatchObject({ signalId: "sig-elite", checkedPrice: 105 });
    expect(loadTrades().map((x) => x.id)).toEqual([trade.id]); // also placed in the local Journal
    expect(h.ticker).toHaveBeenCalledTimes(1);
  });
  it("is BLOCKED when the fresh price is above the zone: nothing reaches the Journal, locally or on the server", async () => {
    h.ticker.mockResolvedValue(price(111));
    const draft = enteredPlan(sig());
    const out = await confirmPlanIfElite(draft, planTrade(draft));
    expect(out).toMatchObject({ ok: false, key: "tradeFeed.cfAbove", price: 111, zone: { low: 100, high: 110 } });
    expect(journalOf()).toEqual([]);
    expect(confirmations()).toBeUndefined();
    expect(loadTrades()).toEqual([]);
  });
  it("is BLOCKED below the zone, and when the price is unavailable or stale", async () => {
    const draft = enteredPlan(sig());
    const trade = planTrade(draft);
    h.ticker.mockResolvedValue(price(99));
    expect(await confirmPlanIfElite(draft, trade)).toMatchObject({ ok: false, key: "tradeFeed.cfBelow" });
    h.ticker.mockRejectedValue(new Error("down"));
    expect(await confirmPlanIfElite(draft, trade)).toMatchObject({ ok: false, key: "tradeFeed.cfUnavailable" });
    h.ticker.mockResolvedValue(price(105, 10 * 60_000));
    expect(await confirmPlanIfElite(draft, trade)).toMatchObject({ ok: false, key: "tradeFeed.cfStale" });
    expect(journalOf()).toEqual([]);
    expect(loadTrades()).toEqual([]);
  });
  it("allows the exact zone boundaries", async () => {
    for (const p of [100, 110]) {
      h.kv.clear();
      h.hashes.clear();
      h.ls.clear();
      h.ticker.mockResolvedValue(price(p));
      const draft = enteredPlan(sig());
      expect((await confirmPlanIfElite(draft, planTrade(draft)))?.ok, String(p)).toBe(true);
    }
  });
  it("the plan's entry price is the member's own number, never the zone or the market price", async () => {
    h.ticker.mockResolvedValue(price(108));
    const draft = enteredPlan(sig(), "103.5");
    await confirmPlanIfElite(draft, planTrade(draft));
    expect(journalOf()[0].entry).toBe(103.5);
  });
  it("duplicate protection: a second Send to Journal, or Confirm Trade after it, is refused", async () => {
    const draft = enteredPlan(sig());
    expect((await confirmPlanIfElite(draft, planTrade(draft)))?.ok).toBe(true);
    const again = await confirmPlanIfElite(draft, planTrade(draft));
    expect(again).toMatchObject({ ok: false, key: "tradeFeed.cfDuplicate" });
    const viaButton = await confirmPOST(new Request("http://x/api/me/confirm-trade", { method: "POST", body: JSON.stringify({ signalId: "sig-elite", entry: 105, invested: 200 }) }));
    expect(viaButton.status).toBe(409);
    expect(journalOf()).toHaveLength(1);
  });
  it("Confirm Trade first, then Send to Journal from a plan: still only one trade", async () => {
    await confirmPOST(new Request("http://x/api/me/confirm-trade", { method: "POST", body: JSON.stringify({ signalId: "sig-elite", entry: 105, invested: 200 }) }));
    const draft = enteredPlan(sig());
    expect(await confirmPlanIfElite(draft, planTrade(draft))).toMatchObject({ ok: false, key: "tradeFeed.cfDuplicate" });
    expect(journalOf()).toHaveLength(1);
  });
  it("explains why it was blocked, with the live price and the zone", async () => {
    const t = (k: string) => ({ "tradeFeed.cfAbove": "price {price} above {low} - {high}" })[k] ?? k;
    expect(outcomeText({ key: "tradeFeed.cfAbove", price: 111, zone: { low: 100, high: 110 } }, t)).toBe("price 111 above 100 - 110");
  });
});

describe("FREE trade plans behave exactly as before", () => {
  it("a plan from a FREE signal is not routed to the server: the normal local flow carries on", async () => {
    const free = h.feed[1] as unknown as PublishedTrade;
    const draft = enteredPlan(free, "10.5", { invalidation: "9", tp1: "13" });
    expect(await confirmPlanIfElite(draft, planTrade(draft))).toBeNull();
    expect(h.ticker).not.toHaveBeenCalled();
    expect(journalOf()).toEqual([]);
  });
  it("a plan with no signal link is untouched", async () => {
    const draft: TradePlanDraft = { ...enteredPlan(sig()), signal: undefined, signalId: undefined };
    expect(await confirmPlanIfElite(draft, planTrade(draft))).toBeNull();
  });
  it("a FREE account (cannot even see ELITE signals) gets null and is never sent to the server check", async () => {
    h.userId = "free_user";
    const draft = enteredPlan(sig());
    expect(await confirmPlanIfElite(draft, planTrade(draft))).toBeNull();
  });
});

describe("the server refuses every other way to store an ELITE-linked Journal trade", () => {
  const forged = (over: Record<string, unknown> = {}) => ({ id: "forged-1", date: "2026-11-04", pair: "SOLUSDT", side: "Long", entry: 105, stop: 98, target: 125, exit: null, size: 2, notes: "", status: "open", invested: 210, source: "signal", signalId: "sig-elite", ...over });

  it("a hand-made trade linked to an ELITE signal (what the old plan flow / Journal import produced) is dropped", async () => {
    const res = await putJournal([forged()]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 0, rejected: ["forged-1"] });
    expect(journalOf()).toEqual([]);
  });
  it("same for a plan-sourced trade, and one linked only through its embedded signal link", async () => {
    const r = await putJournal([forged({ id: "p1", source: "plan", planId: "plan-1" }), forged({ id: "p2", signalId: undefined, signal: { id: "sig-elite" } })]);
    expect((await r.json()).rejected).toEqual(["p1", "p2"]);
    expect(journalOf()).toEqual([]);
  });
  it("a CONFIRMED trade is stored, and the member can still edit it (same id)", async () => {
    await confirmPOST(new Request("http://x/api/me/confirm-trade", { method: "POST", body: JSON.stringify({ signalId: "sig-elite", entry: 105, invested: 200 }) }));
    const confirmed = journalOf()[0];
    const edited = { ...confirmed, notes: "my note", exit: 120, status: "closed", exitDate: "2026-11-05" };
    const res = await putJournal([edited]);
    expect(await res.json()).toEqual({ ok: true, count: 1 });
    expect(journalOf()[0]).toMatchObject({ id: confirmed.id, notes: "my note", exit: 120 });
  });
  it("a second trade for an already-confirmed signal (different id) is dropped, the confirmed one is kept", async () => {
    await confirmPOST(new Request("http://x/api/me/confirm-trade", { method: "POST", body: JSON.stringify({ signalId: "sig-elite", entry: 105, invested: 200 }) }));
    const confirmed = journalOf()[0];
    const res = await putJournal([forged(), confirmed]);
    expect((await res.json()).rejected).toEqual(["forged-1"]);
    expect(journalOf().map((t) => t.id)).toEqual([confirmed.id]);
  });
  it("FREE-signal trades, unknown-signal trades and unlinked manual trades pass untouched", async () => {
    const list = [forged({ id: "f1", signalId: "sig-free" }), forged({ id: "u1", signalId: "gone" }), forged({ id: "m1", signalId: undefined, source: "manual" })];
    const res = await putJournal(list);
    expect(await res.json()).toEqual({ ok: true, count: 3 });
    expect(journalOf().map((t) => t.id)).toEqual(["f1", "u1", "m1"]);
  });
  it("a journal with no signal-linked trades does not even read the feed", async () => {
    await putJournal([forged({ id: "m1", signalId: undefined, source: "manual" })]);
    expect(h.lrangeCalls).toBe(0);
  });
  it("mixed list: only the unconfirmed ELITE-linked trade is dropped", async () => {
    const res = await putJournal([forged({ id: "f1", signalId: "sig-free" }), forged(), forged({ id: "m1", signalId: undefined })]);
    expect((await res.json()).rejected).toEqual(["forged-1"]);
    expect(journalOf().map((t) => t.id)).toEqual(["f1", "m1"]);
  });
  it("the browser drops a trade the server refused, so it cannot linger locally", async () => {
    const ok = { ...forged({ id: "keep", signalId: undefined, source: "manual" }) };
    saveTrades([forged() as never, ok as never]);
    expect(loadTrades().map((x) => x.id)).toEqual(["forged-1", "keep"]);
    const { push } = await import("@/lib/journalSync");
    vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => journalPUT(new Request("http://x" + url, { method: "PUT", body: init?.body })));
    expect(await push(loadTrades())).toBe(true);
    expect(loadTrades().map((x) => x.id)).toEqual(["keep"]);
    expect(journalOf().map((x) => x.id)).toEqual(["keep"]);
  });
});
