// CLOSE-ELITE-v1: the REAL close route and the REAL feed route; only Clerk, Upstash and push are fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ list: [] as Record<string, unknown>[], userId: "u1" as string | null, plan: undefined as unknown, now: 1_800_000_000_000 }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: h.userId }),
  clerkClient: async () => ({ users: { getUser: async () => ({ privateMetadata: { plan: h.plan } }) } }),
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async lrange() { return structuredClone(h.list); }
    async lset(_k: string, i: number, v: Record<string, unknown>) { h.list[i] = structuredClone(v); return "OK"; }
    async hgetall() { return {}; }
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("@/lib/push", () => ({ notifyTradeSubscribers: vi.fn(), notifyTpSlSubscribers: vi.fn(), notifyTradeClosedSubscribers: vi.fn() }));

import { POST as close } from "@/app/api/trade-feed/close/route";
import { GET as feed, PATCH as botPatch } from "@/app/api/trade-feed/route";

const ADMIN = "admin-secret-value";
const BOT = "bot-secret-value";
const sig = (o: Record<string, unknown>) => ({ id: "e1", createdAt: 1, pair: "SOLUSDT", direction: "Long", timeframe: "4H", entryZone: "100 - 110", invalidation: "95", tp1: "120", tp2: "130", tp3: "140", reasoning: "why", status: "open", tier: "elite", ...o });
const closeReq = (body: Record<string, unknown>) => close(new Request("http://x/api/trade-feed/close", { method: "POST", body: JSON.stringify({ secret: ADMIN, id: "e1", ...body }) }));
const feedFor = async (plan: unknown) => { h.plan = plan; return (await feed(new Request("http://x/api/trade-feed"))).json(); };

beforeEach(() => {
  process.env.ADMIN_SECRET = ADMIN;
  process.env.TRADE_BOT_SECRET = BOT;
  process.env.UPSTASH_REDIS_REST_URL = "https://fake";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake";
  h.userId = "u1";
  h.plan = undefined;
  h.list = [sig({}), sig({ id: "f1", tier: "free", tradeId: "T1" })];
});

describe("permissions", () => {
  it("no secret, wrong secret, the bot's secret and a signed-in ELITE member are all refused and change nothing", async () => {
    const before = JSON.stringify(h.list);
    for (const secret of [undefined, "", "nope", BOT]) expect((await closeReq({ secret, outcome: "TP1" })).status, String(secret)).toBe(401);
    h.plan = "elite"; // membership is not admin
    expect((await closeReq({ secret: undefined, outcome: "TP1" })).status).toBe(401);
    expect(JSON.stringify(h.list)).toBe(before);
  });
  it("only ELITE signals: a FREE (bot) signal cannot be closed here, and the bot still cannot touch an ELITE one", async () => {
    expect((await closeReq({ id: "f1", outcome: "TP1" })).status).toBe(404);
    expect(h.list[1].status).toBe("open");
    h.list[0] = sig({ tradeId: "T9" });
    const res = await botPatch(new Request("http://x", { method: "PATCH", body: JSON.stringify({ secret: BOT, tradeId: "T9", status: "closed" }) }));
    expect(res.status).toBe(404);
    expect(h.list[0].status).toBe("open");
  });
  it("rejects missing/invalid outcome and unknown ids", async () => {
    for (const outcome of [undefined, "WIN", "TP4", ""]) expect((await closeReq({ outcome })).status).toBe(400);
    expect((await closeReq({ id: "nope", outcome: "TP1" })).status).toBe(404);
    expect(h.list[0].status).toBe("open");
  });
});

describe("closing outcomes", () => {
  it.each([
    ["TP1", ["TP1"], "120"],
    ["TP2", ["TP1", "TP2"], "130"],
    ["TP3", ["TP1", "TP2", "TP3"], "140"],
    ["SL", ["SL"], "95"],
    ["CANCELLED", [], ""],
  ])("%s", async (outcome, hits, result) => {
    const res = await closeReq({ outcome, reason: "  because  " });
    expect(res.status).toBe(200);
    const s = h.list[0] as Record<string, unknown> & { closing: Record<string, unknown> };
    expect(s.status).toBe("closed");
    expect(s.hitLevels ?? []).toEqual(hits);
    expect(s.closing).toMatchObject({ outcome, result, reason: "because", verified: true });
    expect(typeof s.closing.closedAt).toBe("number");
  });
  it("the result comes from the signal's own levels, never from the request", async () => {
    await closeReq({ outcome: "TP2", result: "999", closing: { result: "999" } });
    expect((h.list[0] as Record<string, unknown> & { closing: Record<string, unknown> }).closing.result).toBe("130");
  });
  it("original signal data is preserved; hit levels already recorded are kept", async () => {
    h.list[0] = sig({ hitLevels: ["TP1"] });
    await closeReq({ outcome: "TP2" });
    expect(h.list[0]).toMatchObject({ id: "e1", createdAt: 1, pair: "SOLUSDT", direction: "Long", timeframe: "4H", entryZone: "100 - 110", invalidation: "95", tp1: "120", tp2: "130", tp3: "140", reasoning: "why", tier: "elite", hitLevels: ["TP1", "TP2"] });
  });
  it("a second close (same or different outcome) is refused and the first record stays", async () => {
    expect((await closeReq({ outcome: "TP1" })).status).toBe(200);
    const first = JSON.stringify(h.list[0]);
    expect((await closeReq({ outcome: "SL" })).status).toBe(409);
    expect((await closeReq({ outcome: "TP1" })).status).toBe(409);
    expect(JSON.stringify(h.list[0])).toBe(first);
  });
});

describe("public visibility", () => {
  it("open: FREE members only get a locked preview; after closing they get the complete signal with its verified result", async () => {
    let body = await feedFor("free");
    expect(body.locked).toHaveLength(1);
    expect(body.trades.map((t: { id: string }) => t.id)).toEqual(["f1"]);
    await closeReq({ outcome: "TP2", reason: "target reached" });
    body = await feedFor("free");
    expect(body.locked).toBeUndefined();
    expect(body.trades.find((t: { id: string }) => t.id === "e1")).toMatchObject({
      status: "closed", entryZone: "100 - 110", invalidation: "95", tp1: "120", tp2: "130", tp3: "140", hitLevels: ["TP1", "TP2"],
      closing: { outcome: "TP2", result: "130", reason: "target reached", verified: true },
    });
  });
  it("signed-out viewers still get nothing", async () => {
    h.userId = null;
    expect((await feed(new Request("http://x/api/trade-feed"))).status).toBe(401);
  });
});
