// ELITE-TIER-v1 tests. The REAL route and the REAL lib/plan.ts run; only Clerk (session + privateMetadata)
// and Upstash are in-memory fakes. Proves tier assignment and server-side filtering, not Clerk/Upstash.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  list: [] as Record<string, unknown>[],
  userId: null as string | null,
  metadata: {} as Record<string, unknown>,
  clerkFails: false,
  after: [] as Array<() => unknown>,
  counts: {} as Record<string, number>,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: h.userId }),
  clerkClient: async () => ({
    users: {
      getUser: async () => {
        if (h.clerkFails) throw new Error("clerk down");
        return { privateMetadata: h.metadata };
      },
    },
  }),
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async lrange() { return [...h.list]; }
    async hgetall() { return { ...h.counts }; }
    async lpush(_k: string, v: Record<string, unknown>) { h.list.unshift(v); return h.list.length; }
    async ltrim() { return "OK"; }
    async lset(_k: string, i: number, v: Record<string, unknown>) { h.list[i] = v; return "OK"; }
    async lrem(_k: string, _c: number, v: Record<string, unknown>) {
      const i = h.list.findIndex((x) => x.id === v.id);
      if (i === -1) return 0;
      h.list.splice(i, 1);
      return 1;
    }
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { h.after.push(fn); } }));
const push = vi.hoisted(() => ({ trade: vi.fn(), tpsl: vi.fn(), closed: vi.fn() }));
vi.mock("@/lib/push", () => ({
  notifyTradeSubscribers: push.trade,
  notifyTpSlSubscribers: push.tpsl,
  notifyTradeClosedSubscribers: push.closed,
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/trade-feed/route";

const ADMIN = "admin-secret-value";
const BOT = "bot-secret-value";
const trade = (over: Record<string, unknown>) => ({
  id: "x", createdAt: 1, pair: "BTCUSDT", direction: "Long", timeframe: "4H", entryZone: "1", invalidation: "1",
  tp1: "2", tp2: "3", tp3: "4", reasoning: "r", status: "open", ...over,
});
const getFeed = (headers: Record<string, string> = {}) => GET(new Request("http://x/api/trade-feed", { headers }));
const ids = async (res: Response) => ((await res.json()).trades as { id: string }[]).map((t) => t.id).sort();
const post = (secret: string, extra: Record<string, unknown> = {}) =>
  POST(new Request("http://x/api/trade-feed", { method: "POST", body: JSON.stringify({ secret, pair: "ethusdt", direction: "Long", ...extra }) }));
const patch = (body: Record<string, unknown>) => PATCH(new Request("http://x/api/trade-feed", { method: "PATCH", body: JSON.stringify(body) }));
const del = (body: Record<string, unknown>) => DELETE(new Request("http://x/api/trade-feed", { method: "DELETE", body: JSON.stringify(body) }));

beforeEach(() => {
  process.env.ADMIN_SECRET = ADMIN;
  process.env.TRADE_BOT_SECRET = BOT;
  process.env.UPSTASH_REDIS_REST_URL = "https://fake";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake";
  h.list = [
    trade({ id: "legacy", tradeId: "T001" }), // stored before tiers existed: no tier field
    trade({ id: "free1", tier: "free", tradeId: "T002" }),
    trade({ id: "elite1", tier: "elite", pair: "SOLUSDT", entryZone: "777-888", invalidation: "666", tp1: "901", tp2: "902", tp3: "903", reasoning: "SECRET-REASON" }),
  ];
  h.userId = "u1";
  h.metadata = {};
  h.clerkFails = false;
  h.after = [];
  h.counts = {};
  push.trade.mockClear(); push.tpsl.mockClear(); push.closed.mockClear();
});

describe("GET /api/trade-feed - who sees which tier", () => {
  it("requires sign-in or the admin secret", async () => {
    h.userId = null;
    expect((await getFeed()).status).toBe(401);
    expect((await getFeed({ "x-admin-secret": "wrong" })).status).toBe(401);
  });
  it("FREE user: FREE signals only (untiered legacy signals count as free)", async () => {
    h.metadata = { plan: "free" };
    expect(await ids(await getFeed())).toEqual(["free1", "legacy"]);
  });
  it("user with no plan set: FREE only", async () => {
    expect(await ids(await getFeed())).toEqual(["free1", "legacy"]);
  });
  it("Analyzer Pro user: FREE only", async () => {
    h.metadata = { plan: "analyzer" };
    expect(await ids(await getFeed())).toEqual(["free1", "legacy"]);
  });
  it("expired / downgraded Elite (plan no longer \"elite\"): FREE only", async () => {
    for (const plan of ["free", "expired", undefined, null]) {
      h.metadata = { plan };
      expect(await ids(await getFeed())).toEqual(["free1", "legacy"]);
    }
  });
  it("fails closed when the plan lookup errors", async () => {
    h.clerkFails = true;
    expect(await ids(await getFeed())).toEqual(["free1", "legacy"]);
  });
  it("active Elite user: FREE and ELITE", async () => {
    h.metadata = { plan: "elite" };
    expect(await ids(await getFeed())).toEqual(["elite1", "free1", "legacy"]);
  });
  it("admin (valid secret): both tiers, with the tier visible", async () => {
    const body = await (await getFeed({ "x-admin-secret": ADMIN })).json();
    expect(body.trades.map((t: { id: string }) => t.id).sort()).toEqual(["elite1", "free1", "legacy"]);
    expect(body.trades.find((t: { id: string }) => t.id === "legacy").tier).toBe("free");
    expect(body.trades.find((t: { id: string }) => t.id === "elite1").tier).toBe("elite");
  });
  it("a wrong admin secret grants nothing extra", async () => {
    expect(await ids(await getFeed({ "x-admin-secret": "nope" }))).toEqual(["free1", "legacy"]);
  });
  it("OPEN ELITE signal for non-members: a locked preview with NO levels anywhere in the response", async () => {
    h.counts = { elite1: 3 };
    for (const plan of [undefined, "free", "analyzer", "expired"]) {
      h.metadata = { plan };
      const raw = await (await getFeed()).text();
      for (const secret of ["777", "888", "666", "901", "902", "903", "SECRET-REASON"]) expect(raw, `${plan}:${secret}`).not.toContain(secret);
      const body = JSON.parse(raw);
      expect(body.trades.map((t: { id: string }) => t.id).sort()).toEqual(["free1", "legacy"]);
      for (const key of ["entryZone", "invalidation", "tp1", "tp2", "tp3", "reasoning", "hitLevels", "direction", "tradeId"]) expect(JSON.stringify(body.locked), key).not.toContain(key);
      expect(body.locked).toEqual([{ id: "elite1", createdAt: 1, pair: "SOLUSDT", timeframe: "4H", status: "open", tier: "elite", locked: true, confirmations: 3 }]);
    }
  });
  it("members and the admin get the full ELITE signal, not a preview", async () => {
    h.metadata = { plan: "elite" };
    const body = await (await getFeed()).json();
    expect(body.locked).toBeUndefined();
    expect(body.trades.find((t: { id: string }) => t.id === "elite1")).toMatchObject({ entryZone: "777-888", invalidation: "666", tp1: "901" });
    const admin = await (await getFeed({ "x-admin-secret": ADMIN })).json();
    expect(admin.locked).toBeUndefined();
    expect(admin.trades.find((t: { id: string }) => t.id === "elite1").entryZone).toBe("777-888");
  });
  it("CLOSED ELITE signal: the full official record (levels and result) is revealed to FREE viewers too", async () => {
    h.list[2] = { ...(h.list[2] as Record<string, unknown>), status: "closed", hitLevels: ["TP1", "TP2"] };
    for (const plan of [undefined, "free", "expired"]) {
      h.metadata = { plan };
      const body = await (await getFeed()).json();
      expect(body.locked).toBeUndefined();
      expect(body.trades.find((t: { id: string }) => t.id === "elite1")).toMatchObject({ tier: "elite", status: "closed", entryZone: "777-888", invalidation: "666", tp1: "901", tp2: "902", tp3: "903", hitLevels: ["TP1", "TP2"] });
    }
  });
  it("confirmation counts are plain numbers per Signal ID (default 0); no member data is ever in the response", async () => {
    h.counts = { free1: 2, elite1: 5, legacy: "junk" as unknown as number };
    h.metadata = { plan: "elite" };
    const body = await (await getFeed()).json();
    const byId = Object.fromEntries(body.trades.map((t: { id: string; confirmations: number }) => [t.id, t.confirmations]));
    expect(byId).toEqual({ free1: 2, elite1: 5, legacy: 0 });
    expect(JSON.stringify(body)).not.toMatch(/user_|member|email/i);
  });
  it("the feed answers with no-store, so a locked or full view is never cached for another viewer", async () => {
    expect((await getFeed()).headers.get("cache-control")).toBe("no-store");
  });
  it("an unrecognised tier value fails closed (hidden from non-Elite)", async () => {
    h.list.push(trade({ id: "weird", tier: "vip" }));
    expect(await ids(await getFeed())).toEqual(["free1", "legacy"]);
  });
  it("Elite members get canConfirm; Free viewers do not", async () => {
    h.metadata = { plan: "elite" };
    const elite = await (await getFeed()).json();
    expect(elite.canConfirm).toBe(true);
    const t = elite.trades.find((x: { id: string }) => x.id === "elite1");
    expect(t.tier).toBe("elite");
    expect(t.pair).toBe("SOLUSDT");
    for (const plan of [undefined, "free", "analyzer", "expired"]) {
      h.metadata = { plan };
      const free = await (await getFeed()).json();
      expect(free.canConfirm).toBeUndefined();
    }
  });
  it("the admin (not a member) sees both tiers but gets no canConfirm", async () => {
    const body = await (await getFeed({ "x-admin-secret": ADMIN })).json();
    expect(body.canConfirm).toBeUndefined();
  });
});

describe("POST /api/trade-feed - tier assignment", () => {
  it("website Trade Plan (admin secret) publishes ELITE automatically", async () => {
    const res = await post(ADMIN);
    expect(res.status).toBe(201);
    expect(h.list[0].tier).toBe("elite");
    expect(h.list[0].pair).toBe("ETHUSDT");
  });
  it("Telegram bot (bot secret) keeps publishing FREE", async () => {
    const res = await post(BOT, { tradeId: "T300" });
    expect(res.status).toBe(201);
    expect(h.list[0].tier).toBe("free");
    expect(h.list[0].tradeId).toBe("T300");
  });
  it("there is no selector: a tier in the request body is ignored", async () => {
    await post(BOT, { tier: "elite" });
    expect(h.list[0].tier).toBe("free");
    await post(ADMIN, { tier: "free" });
    expect(h.list[0].tier).toBe("elite");
  });
  it("wrong or missing secret is rejected", async () => {
    expect((await post("nope")).status).toBe(401);
    expect((await post("")).status).toBe(401);
    expect(h.list).toHaveLength(3);
  });
  it("a published Elite signal reaches Elite and admin viewers but not Free/Analyzer viewers", async () => {
    await post(ADMIN, { pair: "ADAUSDT" });
    const newId = h.list[0].id as string;
    h.metadata = { plan: "elite" };
    expect(await ids(await getFeed())).toContain(newId);
    h.metadata = { plan: "analyzer" };
    expect(await ids(await getFeed())).not.toContain(newId);
    h.metadata = {};
    expect(await ids(await getFeed())).not.toContain(newId);
    expect(await ids(await getFeed({ "x-admin-secret": ADMIN }))).toContain(newId);
  });
  it("push notifications: every new signal notifies once, FREE (bot) and ELITE (website) alike", async () => {
    await post(BOT);
    await post(ADMIN);
    h.after.forEach((fn) => fn());
    expect(push.trade).toHaveBeenCalledTimes(2);
    expect(push.trade.mock.calls.map((c) => c[0].tier).sort()).toEqual(["elite", "free"]);
  });
});

describe("PATCH (TP/SL updates) - existing mechanism unchanged for FREE", () => {
  it("bot updates a legacy (untiered) signal and subscribers are still notified", async () => {
    const res = await patch({ secret: BOT, tradeId: "T001", hitLevels: ["TP1"], status: "open" });
    expect(res.status).toBe(200);
    expect(h.list.find((t) => t.id === "legacy")!.hitLevels).toEqual(["TP1"]);
    h.after.forEach((fn) => fn());
    expect(push.tpsl).toHaveBeenCalledTimes(1);
    expect(push.tpsl.mock.calls[0][1]).toBe("TP1");
  });
  it("closing a FREE signal via SL and manual close still notify", async () => {
    await patch({ secret: BOT, tradeId: "T002", hitLevels: ["SL"], status: "closed" });
    h.after.forEach((fn) => fn());
    expect(push.tpsl).toHaveBeenCalledWith(expect.objectContaining({ id: "free1" }), "SL");
    h.list.push(trade({ id: "free3", tradeId: "T003", tier: "free" }));
    await patch({ secret: BOT, tradeId: "T003", status: "closed" });
    h.after.forEach((fn) => fn());
    expect(push.closed).toHaveBeenCalledTimes(1);
  });
  it("the bot can NEVER update an Elite signal, even one carrying a tradeId: 404, nothing changed, no push", async () => {
    h.list.find((t) => t.id === "elite1")!.tradeId = "E1";
    const before = JSON.stringify(h.list);
    for (const body of [
      { secret: BOT, tradeId: "E1", hitLevels: ["TP1"], status: "closed" },
      { secret: BOT, tradeId: "E1", status: "closed" },
      { secret: BOT, tradeId: "E1", hitLevels: ["SL"] },
    ]) {
      const res = await patch(body);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
    h.after.forEach((fn) => fn());
    expect(JSON.stringify(h.list)).toBe(before);
    expect(push.tpsl).not.toHaveBeenCalled();
    expect(push.closed).not.toHaveBeenCalled();
  });
  it("the Elite 404 is identical to a genuinely unknown tradeId (the bot cannot tell Elite signals exist)", async () => {
    h.list.find((t) => t.id === "elite1")!.tradeId = "E1";
    const elite = await patch({ secret: BOT, tradeId: "E1", status: "closed" });
    const unknown = await patch({ secret: BOT, tradeId: "NOPE", status: "closed" });
    expect(elite.status).toBe(unknown.status);
    expect(await elite.json()).toEqual(await unknown.json());
  });
  it("if a FREE and an ELITE signal share a tradeId, only the FREE one is updated", async () => {
    h.list.find((t) => t.id === "elite1")!.tradeId = "T002"; // same id as free1
    const res = await patch({ secret: BOT, tradeId: "T002", hitLevels: ["TP1"] });
    expect(res.status).toBe(200);
    expect(h.list.find((t) => t.id === "free1")!.hitLevels).toEqual(["TP1"]);
    expect(h.list.find((t) => t.id === "elite1")!.hitLevels).toBeUndefined();
  });
  it("rejects a wrong secret and the admin secret (bot-only, unchanged)", async () => {
    expect((await patch({ secret: "nope", tradeId: "T001" })).status).toBe(401);
    expect((await patch({ secret: ADMIN, tradeId: "T001" })).status).toBe(401);
  });
});

describe("DELETE - admin manages both tiers", () => {
  it("admin removes a FREE and an ELITE signal", async () => {
    expect((await del({ secret: ADMIN, id: "elite1" })).status).toBe(200);
    expect((await del({ secret: ADMIN, id: "free1" })).status).toBe(200);
    expect(h.list.map((t) => t.id)).toEqual(["legacy"]);
  });
  it("non-admin secrets cannot delete either tier", async () => {
    expect((await del({ secret: BOT, id: "elite1" })).status).toBe(401);
    expect((await del({ secret: "", id: "free1" })).status).toBe(401);
    expect(h.list).toHaveLength(3);
  });
});

describe("REGRESSION: a FREE account must never retrieve Trade Plan (ELITE) signals", () => {
  // Exact body shape app/trade-plan/page.tsx sends when publishing.
  const tradePlanBody = { source: "trade-plan", pair: "BTCUSDT", direction: "Long", timeframe: "4H", entryZone: "100-101", invalidation: "95", tp1: "105", tp2: "110", tp3: "120", reasoning: "plan" };
  const publishFromTradePlan = (secret: string) => POST(new Request("http://x/api/trade-feed", { method: "POST", body: JSON.stringify({ secret, ...tradePlanBody }) }));
  const viewers: Array<[string, Record<string, unknown>]> = [["no plan", {}], ["free", { plan: "free" }], ["analyzer", { plan: "analyzer" }], ["expired", { plan: "expired" }]];

  it("a Trade Plan publish is stored as ELITE and no FREE/Analyzer/expired account can fetch it", async () => {
    expect((await publishFromTradePlan(ADMIN)).status).toBe(201);
    const published = h.list[0];
    expect(published.tier).toBe("elite");
    for (const [name, metadata] of viewers) {
      h.metadata = metadata;
      const raw = await (await getFeed()).text();
      expect(raw, name).not.toContain("100-101");
      expect(raw, name).not.toContain("\"tp3\":\"120\"");
    }
    h.metadata = { plan: "elite" };
    expect(await ids(await getFeed())).toContain(published.id);
  });
  it("a Trade Plan publish made with the BOT secret is refused (never stored as a public FREE signal)", async () => {
    const before = h.list.length;
    expect((await publishFromTradePlan(BOT)).status).toBe(401);
    expect(h.list).toHaveLength(before);
  });
  it("the bot's own publish format (no source) is still stored FREE and visible to FREE accounts", async () => {
    expect((await post(BOT, { tradeId: "T400", timeframe: "4H" })).status).toBe(201);
    const id = h.list[0].id as string;
    expect(h.list[0].tier).toBe("free");
    h.metadata = { plan: "free" };
    expect(await ids(await getFeed())).toContain(id);
  });
  it("a client cannot make a FREE account see Elite data: no query/body/header trick other than the admin secret", async () => {
    const trickHeaders: Array<Record<string, string>> = [{ "x-plan": "elite" }, { "x-tier": "elite" }, { "x-admin-secret": BOT }, { "x-admin-secret": "" }, { authorization: "Bearer elite" }];
    for (const headers of trickHeaders) {
      const res = await GET(new Request("http://x/api/trade-feed?tier=elite&plan=elite&admin=1", { headers }));
      expect(await ids(res)).toEqual(["free1", "legacy"]);
    }
  });
  it("legacy untiered signals stay FREE (backward compatible); only signals stored with tier \"elite\" are hidden", async () => {
    h.metadata = { plan: "free" };
    expect(await ids(await getFeed())).toContain("legacy");
    expect(await ids(await getFeed())).not.toContain("elite1");
  });
});
