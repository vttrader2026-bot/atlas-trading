// The Telegram bot's API surface must stay exactly as it was. These run the REAL legacy routes; only Clerk, Upstash and push
// are fakes. Feed Admin work lives in /api/admin/signals/*, never in these two route files.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({ list: [] as Record<string, unknown>[], userId: null as string | null, plan: undefined as unknown, tpsl: [] as Array<[string, string]>, closed: 0, fresh: 0 }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: h.userId }),
  clerkClient: async () => ({ users: { getUser: async () => ({ privateMetadata: { plan: h.plan } }) } }),
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async lrange() { return structuredClone(h.list); }
    async lpush(_k: string, v: Record<string, unknown>) { h.list.unshift(structuredClone(v)); return 1; }
    async ltrim(_k: string, a: number, b: number) { h.list = h.list.slice(a, b + 1); return "OK"; }
    async lset(_k: string, i: number, v: Record<string, unknown>) { h.list[i] = structuredClone(v); return "OK"; }
    async lrem(_k: string, _c: number, v: unknown) { const i = h.list.findIndex((x) => JSON.stringify(x) === JSON.stringify(v)); if (i < 0) return 0; h.list.splice(i, 1); return 1; }
    async hgetall() { return {}; }
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => void) => fn() }));
vi.mock("@/lib/push", () => ({
  notifyTradeSubscribers: () => { h.fresh++; },
  notifyTpSlSubscribers: (t: { tradeId?: string }, level: string) => h.tpsl.push([String(t.tradeId), level]),
  notifyTradeClosedSubscribers: () => { h.closed++; },
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/trade-feed/route";
import { POST as CLOSE } from "@/app/api/trade-feed/close/route";

const BOT = "bot-secret", ADMIN = "admin-secret";
const sig = (o: Record<string, unknown>) => ({ id: "f1", createdAt: 1, pair: "SOLUSDT", direction: "Long", timeframe: "4H", entryZone: "100", invalidation: "95", tp1: "110", tp2: "120", tp3: "130", reasoning: "r", status: "open", tier: "free", tradeId: "T1", ...o });
const call = (fn: (r: Request) => Promise<Response>, method: string, body: unknown, headers: Record<string, string> = {}) =>
  fn(new Request("http://x/api/trade-feed", { method, body: JSON.stringify(body), headers }));

beforeEach(() => {
  process.env.TRADE_BOT_SECRET = BOT;
  process.env.ADMIN_SECRET = ADMIN;
  process.env.OWNER_CLERK_USER_ID = "owner-1";
  process.env.UPSTASH_REDIS_REST_URL = "https://fake";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake";
  h.userId = null; h.plan = undefined; h.tpsl = []; h.closed = 0; h.fresh = 0;
  h.list = [sig({}), sig({ id: "e1", tier: "elite", tradeId: "T2" })];
});

describe("bot API regression: the legacy routes are the original files", () => {
  const sha = (f: string) => createHash("sha256").update(readFileSync(f, "utf8").replace(/\r\n/g, "\n")).digest("hex");
  it("trade-feed/route.ts and trade-feed/close/route.ts are byte-identical to the pre-Feed-Admin versions", () => {
    expect(sha("app/api/trade-feed/route.ts")).toBe("cd04e24dd1bf75c5e97638cbc4164633ac47dbb5b9507ca5565040ec65f1cf9a");
    expect(sha("app/api/trade-feed/close/route.ts")).toBe("b22366a5beb35312e2da6fa38b740ebaa46f29ebbdfcb4922b09f74ff14e7f49");
  });
});

describe("bot API regression: POST (publish a FREE signal)", () => {
  const body = { secret: BOT, pair: "adausdt", direction: "Long", timeframe: "1H", entryZone: "1", invalidation: "0.9", tp1: "1.2", tradeId: "T9" };
  it("bot secret publishes a FREE signal (201), stores tradeId, and sends the new-signal notification", async () => {
    const res = await call(POST, "POST", body);
    expect(res.status).toBe(201);
    expect(h.list[0]).toMatchObject({ pair: "ADAUSDT", direction: "Long", tier: "free", status: "open", tradeId: "T9" });
    expect(h.fresh).toBe(1);
  });
  it("wrong or missing secret is 401, bad payload is 400, and the admin secret still gets the 403 it had", async () => {
    expect((await call(POST, "POST", { ...body, secret: "nope" })).status).toBe(401);
    expect((await call(POST, "POST", { ...body, secret: undefined })).status).toBe(401);
    expect((await call(POST, "POST", { ...body, pair: "" })).status).toBe(400);
    expect((await call(POST, "POST", { ...body, secret: ADMIN })).status).toBe(403);
    expect((await call(POST, "POST", { ...body, source: "trade-plan" })).status).toBe(401);
    expect(h.list).toHaveLength(2);
  });
});

describe("bot API regression: PATCH (TP / SL / close updates)", () => {
  it("records new TP levels on a FREE signal and notifies once per NEW level", async () => {
    const res = await call(PATCH, "PATCH", { secret: BOT, tradeId: "T1", hitLevels: ["TP1", "TP2"] });
    expect(res.status).toBe(200);
    expect(h.list[0]).toMatchObject({ hitLevels: ["TP1", "TP2"], status: "open" });
    expect(h.tpsl).toEqual([["T1", "TP1"], ["T1", "TP2"]]);
    h.tpsl = [];
    await call(PATCH, "PATCH", { secret: BOT, tradeId: "T1", hitLevels: ["TP1", "TP2"] });
    expect(h.tpsl).toHaveLength(0);
  });
  it("closing with a new level sends only the TP/SL notification; a plain close sends the closed notification", async () => {
    await call(PATCH, "PATCH", { secret: BOT, tradeId: "T1", status: "closed", hitLevels: ["SL"] });
    expect(h.tpsl).toEqual([["T1", "SL"]]);
    expect(h.closed).toBe(0);
    h.list[0] = sig({ tradeId: "T3" });
    await call(PATCH, "PATCH", { secret: BOT, tradeId: "T3", status: "closed" });
    expect(h.closed).toBe(1);
    expect(h.list[0].status).toBe("closed");
  });
  it("never touches an ELITE signal (404), refuses wrong secrets (401) and a missing tradeId (400)", async () => {
    expect((await call(PATCH, "PATCH", { secret: BOT, tradeId: "T2", status: "closed" })).status).toBe(404);
    expect(h.list[1].status).toBe("open");
    expect((await call(PATCH, "PATCH", { secret: ADMIN, tradeId: "T1", status: "closed" })).status).toBe(401);
    expect((await call(PATCH, "PATCH", { secret: BOT })).status).toBe(400);
  });
});

describe("bot API regression: GET and the admin-secret routes behave as before", () => {
  it("GET: signed-out 401; FREE member gets FREE signals + a locked ELITE preview; the x-admin-secret header still reads ELITE; the owner account alone does not", async () => {
    expect((await GET(new Request("http://x/api/trade-feed"))).status).toBe(401);
    h.userId = "u1";
    const free = await (await GET(new Request("http://x/api/trade-feed"))).json();
    expect(free.trades.map((t: { id: string }) => t.id)).toEqual(["f1"]);
    expect(free.locked).toHaveLength(1);
    h.userId = "owner-1";
    const owner = await (await GET(new Request("http://x/api/trade-feed"))).json();
    expect(owner.trades.map((t: { id: string }) => t.id)).toEqual(["f1"]);
    expect(owner.canConfirm).toBeUndefined();
    h.userId = null;
    const adm = await GET(new Request("http://x/api/trade-feed", { headers: { "x-admin-secret": ADMIN } }));
    expect((await adm.json()).trades).toHaveLength(2);
  });
  it("DELETE /api/trade-feed still works with the admin secret only (the bot secret is refused)", async () => {
    expect((await call(DELETE, "DELETE", { secret: BOT, id: "e1" })).status).toBe(401);
    expect(h.list).toHaveLength(2);
    expect((await call(DELETE, "DELETE", { secret: ADMIN, id: "e1" })).status).toBe(200);
    expect(h.list.map((t) => t.id)).toEqual(["f1"]);
  });
  it("POST /api/trade-feed/close still closes an ELITE signal with the admin secret, and nothing else", async () => {
    expect((await call(CLOSE, "POST", { secret: BOT, id: "e1", outcome: "TP1" })).status).toBe(401);
    expect((await call(CLOSE, "POST", { secret: ADMIN, id: "f1", outcome: "TP1" })).status).toBe(404);
    const ok = await call(CLOSE, "POST", { secret: ADMIN, id: "e1", outcome: "TP1" });
    expect(ok.status).toBe(200);
    expect(h.list[1]).toMatchObject({ status: "closed", hitLevels: ["TP1"], closing: { outcome: "TP1", result: "110", verified: true } });
  });
});
