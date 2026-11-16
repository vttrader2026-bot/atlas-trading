// INVEST-SIGNAL-v1: Investment Signals (second Trade Feed publication type), sharing from Atlas Investor, member-owned plans.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  userId: "owner-1" as string | null,
  meta: {} as Record<string, unknown>,
  lists: {} as Record<string, unknown[]>,
  writes: [] as string[],
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: h.userId }),
  clerkClient: async () => ({ users: { getUser: async () => ({ privateMetadata: h.meta }) } }),
}));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async lrange(k: string) { return structuredClone(h.lists[k] ?? []); }
    async lpush(k: string, v: unknown) { h.writes.push(k); (h.lists[k] ??= []).unshift(structuredClone(v)); return 1; }
    async ltrim(k: string, a: number, b: number) { h.lists[k] = (h.lists[k] ?? []).slice(a, b + 1); return "OK"; }
    async lset(k: string, i: number, v: unknown) { h.writes.push(k); (h.lists[k] ??= [])[i] = structuredClone(v); return "OK"; }
    async lrem(k: string, _c: number, v: unknown) { const l = h.lists[k] ?? []; const i = l.findIndex((x) => same(x, v)); if (i < 0) return 0; l.splice(i, 1); return 1; }
    async hget() { return null; }
    async hset() { return 1; }
    async get() { return null; }
    async set() { return "OK"; }
  },
}));

import { GET as LIST } from "@/app/api/investment-signals/route";
import { POST as PUBLISH } from "@/app/api/admin/investment-signals/route";
import { POST as STATUS } from "@/app/api/admin/investment-signals/[id]/status/route";
import { GET as SWING_FEED } from "@/app/api/trade-feed/route";
import { dictionaries } from "@/lib/i18n";
import { INVESTMENT_KEY, canMoveInvestment, investmentAsset, investmentsForViewer, parseInvestmentFields, planToInvestmentDraft, type InvestmentSignal } from "@/lib/investmentSignal";
import { INVESTOR_ASSETS } from "@/lib/investor/assets";
import { TRADE_FEED_KEY } from "@/lib/tradeFeed";
import type { DcaPlan } from "@/lib/investor/model";

const src = (f: string) => readFileSync(f, "utf8");
const req = (body?: unknown) => new Request("http://x/api/admin/investment-signals", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), headers: { host: "x" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const GOOD = { confirm: true, tier: "free", asset: "BTC", thesis: "Long-term store of value", horizonMonths: 24, strategy: "Buy monthly", zone: "", risks: "Volatility", notes: "" };
const stored = () => (h.lists[INVESTMENT_KEY] ?? []) as InvestmentSignal[];
const asElite = () => { h.userId = "m-1"; h.meta = { plan: "elite", eliteUntil: Date.now() + 1e9 }; };
const asFree = () => { h.userId = "m-2"; h.meta = {}; };

beforeEach(() => {
  process.env.OWNER_CLERK_USER_ID = "owner-1";
  process.env.UPSTASH_REDIS_REST_URL = "https://fake"; process.env.UPSTASH_REDIS_REST_TOKEN = "fake";
  h.userId = "owner-1"; h.meta = {}; h.lists = {}; h.writes = [];
});

describe("publishing (owner only, no trading fields)", () => {
  it("needs no stop-loss, targets or entry; stores a separate record with status Active", async () => {
    const r = await PUBLISH(req(GOOD));
    expect(r.status).toBe(201);
    const s = stored()[0];
    expect(s).toMatchObject({ asset: "BTC", pair: "BTC/USDT", tier: "free", status: "active", horizonMonths: 24 });
    for (const k of ["entryZone", "invalidation", "tp1", "tp2", "tp3", "direction", "stopLoss"]) expect(s).not.toHaveProperty(k);
    expect(h.writes.every((k) => k === INVESTMENT_KEY || k === "atlas:admin-audit")).toBe(true);
    expect(h.lists[TRADE_FEED_KEY]).toBeUndefined(); // the Spot Swing feed is never touched
  });
  it("a member, a signed-out request and an unset owner all get 404 and nothing is stored", async () => {
    asElite(); expect((await PUBLISH(req(GOOD))).status).toBe(404);
    asFree(); expect((await PUBLISH(req(GOOD))).status).toBe(404);
    h.userId = null; expect((await PUBLISH(req(GOOD))).status).toBe(404);
    h.userId = "owner-1"; delete process.env.OWNER_CLERK_USER_ID; expect((await PUBLISH(req(GOOD))).status).toBe(404);
    expect(stored()).toHaveLength(0);
  });
  it("requires confirmation, an explicit FREE/ELITE audience and a supported coin", async () => {
    expect((await PUBLISH(req({ ...GOOD, confirm: false }))).status).toBeGreaterThanOrEqual(400);
    expect((await PUBLISH(req({ ...GOOD, tier: undefined }))).status).toBe(400);
    expect((await PUBLISH(req({ ...GOOD, asset: "PEPE" }))).status).toBe(400);
    expect(stored()).toHaveLength(0);
  });
  it("validates thesis, 6-36 month horizon, strategy and risks; zone and notes stay optional", () => {
    const ok = (o: Record<string, unknown>) => parseInvestmentFields({ ...GOOD, ...o }).ok;
    expect(ok({})).toBe(true);
    expect(ok({ thesis: " " })).toBe(false);
    expect(ok({ horizonMonths: 5 })).toBe(false);
    expect(ok({ horizonMonths: 37 })).toBe(false);
    expect(ok({ horizonMonths: 6 })).toBe(true);
    expect(ok({ horizonMonths: 36 })).toBe(true);
    expect(ok({ horizonMonths: 12.5 })).toBe(false);
    expect(ok({ strategy: "" })).toBe(false);
    expect(ok({ risks: "" })).toBe(false);
    expect(investmentAsset("btcusdt")).toBe("BTC");
    expect(INVESTOR_ASSETS.length).toBe(17);
  });
  it("the same open idea (coin and audience) cannot be published twice; double submit creates one record", async () => {
    expect((await PUBLISH(req(GOOD))).status).toBe(201);
    expect((await PUBLISH(req(GOOD))).status).toBe(409);
    expect(stored()).toHaveLength(1);
    expect((await PUBLISH(req({ ...GOOD, tier: "elite" }))).status).toBe(201);
  });
});

describe("statuses", () => {
  it("Active <-> Thesis Under Review, then Completed or Cancelled are final; owner only", async () => {
    await PUBLISH(req(GOOD));
    const id = stored()[0].id;
    asElite(); expect((await STATUS(req({ confirm: true, status: "review" }), ctx(id))).status).toBe(404);
    h.userId = "owner-1";
    expect((await STATUS(req({ confirm: true, status: "review" }), ctx(id))).status).toBe(200);
    expect(stored()[0].status).toBe("review");
    expect((await STATUS(req({ confirm: true, status: "active" }), ctx(id))).status).toBe(200);
    expect((await STATUS(req({ confirm: true, status: "completed" }), ctx(id))).status).toBe(200);
    expect((await STATUS(req({ confirm: true, status: "active" }), ctx(id))).status).toBe(409);
    expect((await STATUS(req({ confirm: true, status: "bogus" }), ctx(id))).status).toBe(400);
    expect((await STATUS(req({ confirm: true, status: "cancelled" }), ctx("nope"))).status).toBe(404);
    expect(stored()[0].thesis).toBe(GOOD.thesis);
    expect(canMoveInvestment("cancelled", "active")).toBe(false);
  });
});

describe("access: FREE and ELITE", () => {
  beforeEach(async () => { await PUBLISH(req(GOOD)); await PUBLISH(req({ ...GOOD, tier: "elite", asset: "ETH", thesis: "ELITE SECRET THESIS" })); });
  it("a signed-out request is refused", async () => { h.userId = null; expect((await LIST()).status).toBe(401); });
  it("a Free member gets the FREE idea in full and only an identity placeholder for the ELITE idea", async () => {
    asFree();
    const body = await (await LIST()).json();
    expect(body.investments.map((i: InvestmentSignal) => i.asset)).toEqual(["BTC"]);
    expect(body.locked).toHaveLength(1);
    expect(Object.keys(body.locked[0]).sort()).toEqual(["asset", "createdAt", "id", "locked", "pair", "tier"]);
    expect(JSON.stringify(body)).not.toContain("ELITE SECRET THESIS");
  });
  it("an active ELITE member and the owner get both in full", async () => {
    asElite();
    expect((await (await LIST()).json()).investments).toHaveLength(2);
    h.userId = "owner-1"; h.meta = {};
    expect((await (await LIST()).json()).investments).toHaveLength(2);
  });
  it("an expired ELITE member is treated as Free", async () => {
    h.userId = "m-3"; h.meta = { plan: "elite", eliteUntil: Date.now() - 1000 };
    const body = await (await LIST()).json();
    expect(body.investments).toHaveLength(1);
    expect(body.locked).toHaveLength(1);
  });
  it("investmentsForViewer is the single decision point", () => {
    const s = stored();
    expect(investmentsForViewer(s, false).investments.every((i) => i.tier === "free")).toBe(true);
    expect(investmentsForViewer(s, true).locked).toHaveLength(0);
  });
  it("Investment Signals never appear in the Spot Swing feed or its API", async () => {
    asElite();
    const feed = await (await SWING_FEED(new Request("http://x/api/trade-feed"))).json().catch(() => null);
    expect(JSON.stringify(feed ?? "")).not.toContain("ELITE SECRET THESIS");
  });
});

describe("sharing an Investor plan publishes only public-safe data", () => {
  const PRIVATE_PLAN = { id: "p1", name: "My secret savings plan", asset: "SOL", budget: 98765, initial: 4321, recurring: { amount: 777, frequency: "weekly", count: 52, start: "2026-01-05" }, dips: [{ dropPct: 10, amount: 555 }, { dropPct: 20, amount: 666 }], refPrice: 123.45, createdAt: "2026-01-01", purchases: [{ price: 111, qty: 3 }], notes: "private note" } as unknown as DcaPlan;
  it("the suggestion carries only coin, schedule shape and dip percentages; no budget, amounts, price, name, dates or purchases", () => {
    const d = planToInvestmentDraft(PRIVATE_PLAN);
    const text = JSON.stringify(d);
    for (const secret of ["98765", "4321", "777", "555", "666", "123.45", "secret", "2026-01", "111", "private"]) expect(text).not.toContain(secret);
    expect(d.asset).toBe("SOL");
    expect(d.horizonMonths).toBeGreaterThanOrEqual(6);
    expect(d.horizonMonths).toBeLessThanOrEqual(36);
    expect(d.strategy).toContain("10%");
  });
  it("sharing does not mutate the plan", () => {
    const before = JSON.stringify(PRIVATE_PLAN);
    planToInvestmentDraft(PRIVATE_PLAN);
    expect(JSON.stringify(PRIVATE_PLAN)).toBe(before);
  });
  it("the dialog and the lib read no investor storage and call only the owner publish endpoint", () => {
    const dlg = src("components/investor/ShareInvestmentDialog.tsx");
    expect(dlg).toContain("/api/admin/investment-signals");
    expect(dlg).not.toMatch(/\/api\/me\/investor|useInvestor|localStorage/);
    expect(src("lib/investmentSignal.ts")).not.toMatch(/plan\.(budget|purchases|refPrice|name|recurring\.amount)/);
  });
  it("the Share button is owner-only in the UI and never writes the plan", () => {
    const page = src("app/investor/page.tsx");
    expect(page).toContain("onShare={isOwner ?");
    const dca = src("components/investor/Dca.tsx");
    expect(dca).toContain("onClick={() => onShare(plan)}");
  });
});

describe("members create their own, independent plan", () => {
  it("the card only links to /investor?plan=COIN; viewing creates nothing and there is no Journal link or Confirm", () => {
    const card = src("components/tradefeed/InvestmentSignalCard.tsx").replace(/^\s*\/\/.*$/gm, "");
    expect(card).toContain("/investor?plan=${encodeURIComponent(signal.asset)}");
    expect(card).not.toMatch(/fetch\(|\/api\/me\/|ConfirmTradeDialog|journal|confirm-trade/i);
  });
  it("/investor?plan=COIN only opens the normal new-plan form with the coin; nothing is saved until the member presses Create", () => {
    const dca = src("components/investor/Dca.tsx");
    expect(dca).toContain("initialAsset={startAsset");
    expect(dca).toContain("limit !== null && active >= limit"); // Free/ELITE plan limits still apply
    const page = src("app/investor/page.tsx");
    const block = page.slice(page.indexOf("INVEST-SIGNAL-v1: /investor?plan="), page.indexOf("if (!a) return;"));
    expect(block).toContain("setPlanAsset(p)");
    expect(block).not.toMatch(/run\(|persist|fetch\(|plans:/);
    expect(page).toContain("isSupportedTicker(p)"); // unsupported coins are ignored
  });
  it("no copy of the publisher's budget, purchases or portfolio exists in the member flow", () => {
    for (const f of ["components/tradefeed/InvestmentSignalCard.tsx", "app/api/investment-signals/route.ts"]) expect(src(f).replace(/^\s*\/\/.*$/gm, "")).not.toMatch(/budget|purchases|portfolio/i);
  });
});

describe("Watch Signal is gone; Spot Swing actions are intact", () => {
  it("no Watch Signal button, state or request remains in Trade Feed", () => {
    for (const f of ["components/tradefeed/SignalActions.tsx", "app/trade-feed/page.tsx"]) {
      expect(src(f)).not.toMatch(/watchUpdates|toggleWatch|onToggleWatch|watchBusy|\/api\/me\/signals|tradeFeed\.watch/);
    }
  });
  it("Confirm Trade, Create Trade Plan and Open in Binance remain", () => {
    const a = src("components/tradefeed/SignalActions.tsx");
    expect(a).toContain("ConfirmTradeDialog");
    expect(a).toContain("BinanceSpotLink");
  });
});

describe("EN, FR and AR", () => {
  it("have the same Investment Signal keys, with {n} where needed", () => {
    const get = (l: "en" | "fr" | "ar") => (dictionaries[l] as unknown as { investSignal: Record<string, string> }).investSignal;
    const en = Object.keys(get("en")).sort();
    for (const l of ["fr", "ar"] as const) {
      expect(Object.keys(get(l)).sort()).toEqual(en);
      for (const k of en) expect(get(l)[k].length).toBeGreaterThan(0);
      expect(get(l).months).toContain("{n}");
    }
    for (const k of ["stActive", "stReview", "stCompleted", "stCancelled", "createPlan", "shareToFeed"]) expect(en).toContain(k);
  });
});
