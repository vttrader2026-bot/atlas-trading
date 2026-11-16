// FEED-ADMIN-v1: owner management of signals on /trade-feed. The REAL owner routes and the real feed route run;
// only Clerk, Upstash and push are fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  userId: "owner-1" as string | null,
  meta: {} as Record<string, unknown>,
  lists: {} as Record<string, unknown[]>,
  hashes: {} as Record<string, Record<string, unknown>>,
  tpsl: [] as Array<[unknown, string]>,
  closedPush: [] as unknown[],
  newPush: [] as unknown[],
  failAudit: false,
  failLrem: false,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: h.userId }),
  clerkClient: async () => ({ users: { getUser: async () => ({ privateMetadata: h.meta }) } }),
}));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async lrange(k: string) { return structuredClone(h.lists[k] ?? []); }
    async lpush(k: string, v: unknown) { if (h.failAudit && k === "atlas:admin-audit") throw new Error("audit down"); (h.lists[k] ??= []).unshift(structuredClone(v)); return 1; }
    async ltrim(k: string, a: number, b: number) { h.lists[k] = (h.lists[k] ?? []).slice(a, b + 1); return "OK"; }
    async lset(k: string, i: number, v: unknown) { (h.lists[k] ??= [])[i] = structuredClone(v); return "OK"; }
    async lrem(k: string, _c: number, v: unknown) { if (h.failLrem) return 0; const l = h.lists[k] ?? []; const i = l.findIndex((x) => same(x, v)); if (i < 0) return 0; l.splice(i, 1); return 1; }
    async hget(k: string, f: string) { return structuredClone(h.hashes[k]?.[f] ?? null); }
    async hset(k: string, o: Record<string, unknown>) { h.hashes[k] = { ...(h.hashes[k] ?? {}), ...structuredClone(o) }; return 1; }
    async hdel(k: string, f: string) { const had = h.hashes[k] && f in h.hashes[k]; if (had) delete h.hashes[k][f]; return had ? 1 : 0; }
    async hgetall(k: string) { return structuredClone(h.hashes[k] ?? null); }
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => void) => fn() }));
vi.mock("@/lib/push", () => ({
  notifyTradeSubscribers: (t: unknown) => h.newPush.push(t),
  notifyTpSlSubscribers: (t: unknown, level: string) => h.tpsl.push([t, level]),
  notifySignalEvent: (t: unknown, event: string) => h.tpsl.push([t, event]), // SIGNAL-EVENTS-v1: owner status/cancel notify through this
  notifyTradeClosedSubscribers: (t: unknown) => h.closedPush.push(t),
}));

import { PATCH as BOT_PATCH } from "@/app/api/trade-feed/route";
import { GET as OWNER_FEED } from "@/app/api/admin/signals/feed/route";
import { PATCH, DELETE } from "@/app/api/admin/signals/[id]/route";
import { POST as CANCEL } from "@/app/api/admin/signals/[id]/cancel/route";
import { POST as STATUS } from "@/app/api/admin/signals/[id]/status/route";
import { POST as QUICK } from "@/app/api/admin/signals/quick-publish/route";
import { GET as FEED, POST as BOT_POST } from "@/app/api/trade-feed/route";
import nextConfig from "@/next.config";
import { CONFIRM_COUNTS_KEY, TRADE_FEED_KEY } from "@/lib/tradeFeed";
import { feedAdminAr, feedAdminEn, feedAdminFr } from "@/lib/i18nFeedAdmin";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api/admin/signals/s", { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { host: "x", ...headers } });
const feed = () => (h.lists[TRADE_FEED_KEY] ?? []) as Record<string, unknown>[];
const trade = (id: string, o: Record<string, unknown> = {}) => ({ id, createdAt: Date.now(), pair: "SOLUSDT", direction: "Long", timeframe: "4H", entryZone: "100 - 102", invalidation: "95", tp1: "110", tp2: "120", tp3: "130", reasoning: "why", status: "open", ...o });
const EDIT = { pair: "SOLUSDT", direction: "Long", timeframe: "1D", entryZone: "101 - 103", invalidation: "96", tp1: "111", tp2: "121", tp3: "131", reasoning: "new" };
const asMember = () => { h.userId = "member-1"; h.meta = { plan: "elite", eliteUntil: Date.now() + 1e9 }; };

beforeEach(() => {
  process.env.OWNER_CLERK_USER_ID = "owner-1";
  process.env.UPSTASH_REDIS_REST_URL = "https://fake";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake";
  process.env.TRADE_BOT_SECRET = "bot-secret";
  process.env.ADMIN_SECRET = "adm-secret";
  h.userId = "owner-1"; h.meta = {}; h.lists = {}; h.hashes = {}; h.tpsl = []; h.closedPush = []; h.newPush = []; h.failAudit = false; h.failLrem = false;
  h.lists[TRADE_FEED_KEY] = [trade("free1"), trade("elite1", { tier: "elite" })];
});

describe("only the owner can manage signals (server-side)", () => {
  const calls = [
    ["edit", () => PATCH(req("PATCH", EDIT), ctx("free1"))],
    ["status", () => STATUS(req("POST", { confirm: true, outcome: "TP1" }), ctx("free1"))],
    ["cancel", () => CANCEL(req("POST", { confirm: true }), ctx("free1"))],
    ["delete", () => DELETE(req("DELETE", { confirm: true, published: true }), ctx("free1"))],
  ] as const;
  for (const [name, call] of calls) {
    it(`${name}: a signed-in ELITE member, a free member and a signed-out request all get 404 and change nothing`, async () => {
      const before = JSON.stringify(feed());
      asMember();
      expect((await call()).status).toBe(404);
      h.userId = "free-9"; h.meta = {};
      expect((await call()).status).toBe(404);
      h.userId = null;
      expect((await call()).status).toBe(404);
      expect(JSON.stringify(feed())).toBe(before);
      expect(h.tpsl).toHaveLength(0);
    });
    it(`${name}: fails closed when OWNER_CLERK_USER_ID is unset`, async () => {
      const before = JSON.stringify(feed());
      delete process.env.OWNER_CLERK_USER_ID;
      expect((await call()).status).toBe(404);
      process.env.OWNER_CLERK_USER_ID = "owner-1";
      expect(JSON.stringify(feed())).toBe(before);
    });
  }
  it("a body claiming to be the owner, or carrying the admin secret, changes nothing", async () => {
    asMember();
    const res = await DELETE(req("DELETE", { confirm: true, published: true, owner: true, secret: "adm-secret" }, { "x-admin-secret": "adm-secret" }), ctx("free1"));
    expect(res.status).toBe(404);
    expect(feed()).toHaveLength(2);
  });
  it("a cross-site Origin is refused even for the owner", async () => {
    expect((await DELETE(req("DELETE", { confirm: true, published: true }, { origin: "https://evil.example" }), ctx("free1"))).status).toBe(403);
    expect(feed()).toHaveLength(2);
  });
});

describe("Edit signal", () => {
  it("updates the levels of an open, unconfirmed signal of either audience and keeps its tier", async () => {
    expect((await PATCH(req("PATCH", EDIT), ctx("free1"))).status).toBe(200);
    expect((await PATCH(req("PATCH", { ...EDIT, tier: "elite" }), ctx("elite1"))).status).toBe(200);
    expect(feed()[0]).toMatchObject({ id: "free1", entryZone: "101 - 103", tp3: "131", reasoning: "new" });
    expect(feed()[0].tier).toBeUndefined();
    expect(feed()[1]).toMatchObject({ id: "elite1", invalidation: "96", tier: "elite" });
  });
  it("cannot change the audience, and refuses invalid levels, confirmed and closed signals", async () => {
    expect((await PATCH(req("PATCH", { ...EDIT, tier: "elite" }), ctx("free1"))).status).toBe(400);
    expect((await PATCH(req("PATCH", { ...EDIT, entryZone: "" }), ctx("free1"))).status).toBe(400);
    h.hashes[CONFIRM_COUNTS_KEY] = { free1: 3 };
    expect((await PATCH(req("PATCH", EDIT), ctx("free1"))).status).toBe(409);
    await CANCEL(req("POST", { confirm: true }), ctx("elite1"));
    expect((await PATCH(req("PATCH", EDIT), ctx("elite1"))).status).toBe(409);
    expect(feed()[0].entryZone).toBe("100 - 102");
  });
  it("unknown signal is 404", async () => {
    expect((await PATCH(req("PATCH", EDIT), ctx("nope"))).status).toBe(404);
  });
});

describe("Update status", () => {
  const st = (id: string, outcome: string, reason?: string) => STATUS(req("POST", { confirm: true, outcome, reason }), ctx(id));
  it("TP1 records the hit and keeps the signal OPEN: no closing record, every original level kept", async () => {
    expect((await st("free1", "TP1", "hit")).status).toBe(200);
    expect(feed()[0]).toMatchObject({ id: "free1", status: "open", hitLevels: ["TP1"], entryZone: "100 - 102", invalidation: "95", tp1: "110", tp2: "120", tp3: "130" });
    expect(feed()[0].closing).toBeUndefined();
  });
  it("TP2 records TP1 and TP2 and stays open; TP3 afterwards closes with the verified result", async () => {
    await st("free1", "TP2");
    expect(feed()[0]).toMatchObject({ status: "open", hitLevels: ["TP1", "TP2"] });
    expect(feed()[0].closing).toBeUndefined();
    expect((await st("free1", "TP3", "done")).status).toBe(200);
    expect(feed()[0]).toMatchObject({ status: "closed", hitLevels: ["TP1", "TP2", "TP3"], entryZone: "100 - 102", tp1: "110", tp3: "130", closing: { outcome: "TP3", result: "130", reason: "done", verified: true } });
  });
  it("TP3 directly closes with TP1-TP3 recorded; SL closes and records the stop-loss as the result", async () => {
    await st("free1", "TP3");
    expect(feed()[0]).toMatchObject({ status: "closed", hitLevels: ["TP1", "TP2", "TP3"] });
    await st("elite1", "SL");
    expect(feed()[1]).toMatchObject({ status: "closed", hitLevels: ["SL"], closing: { outcome: "SL", result: "95" } });
  });
  it("SL after a partial hit closes the signal and keeps the earlier hit", async () => {
    await st("free1", "TP1");
    expect((await st("free1", "SL")).status).toBe(200);
    expect(feed()[0]).toMatchObject({ status: "closed", hitLevels: ["TP1", "SL"], closing: { outcome: "SL" } });
  });
  it("the same target is never recorded or notified twice (409, nothing written)", async () => {
    await st("free1", "TP1");
    const before = JSON.stringify(feed()[0]);
    h.tpsl = [];
    expect((await st("free1", "TP1")).status).toBe(409);
    expect(JSON.stringify(feed()[0])).toBe(before);
    expect(h.tpsl).toHaveLength(0);
    await st("free1", "TP2");
    expect(h.tpsl.map((c) => c[1])).toEqual(["TP2"]);
    expect((await st("free1", "TP2")).status).toBe(409);
    expect((await st("free1", "TP1")).status).toBe(409);
    expect(feed()[0].hitLevels).toEqual(["TP1", "TP2"]);
    expect(h.tpsl).toHaveLength(1);
  });
  it("requires confirmation and a real outcome; CANCELLED is not a status (use Cancel)", async () => {
    expect((await STATUS(req("POST", { outcome: "TP1" }), ctx("free1"))).status).toBe(400);
    for (const outcome of ["CANCELLED", "TP4", "", undefined, "tp1"]) expect((await STATUS(req("POST", { confirm: true, outcome }), ctx("free1"))).status).toBe(400);
    expect(feed()[0].status).toBe("open");
  });
  it("refuses a closed signal (409), a missing signal (404) and a level the signal does not have (400)", async () => {
    expect((await st("free1", "TP3")).status).toBe(200);
    expect((await st("free1", "TP2")).status).toBe(409);
    expect((await st("nope", "TP1")).status).toBe(404);
    h.lists[TRADE_FEED_KEY] = [trade("tp3only", { tp1: "", tp2: "" })];
    expect((await st("tp3only", "TP1")).status).toBe(400);
  });
  it("SIGNAL-EVENTS-v1: the chosen result is notified once for FREE and ELITE signals (audience is decided in notifySignalEvent); implied earlier targets are not announced", async () => {
    await st("free1", "TP2");
    expect(h.tpsl.map((c) => c[1])).toEqual(["TP2"]);
    h.tpsl = [];
    await st("free1", "TP3");
    expect(h.tpsl.map((c) => c[1])).toEqual(["TP3"]);
    h.tpsl = [];
    await st("elite1", "TP1");
    await st("elite1", "TP3");
    expect(h.tpsl.map((c) => [(c[0] as { id: string }).id, c[1]])).toEqual([["elite1", "TP1"], ["elite1", "TP3"]]);
    expect(h.closedPush).toHaveLength(0); // the old broadcast helper is not used by the owner routes
  });
  it("SIGNAL-EVENTS-v1: cancelling a FREE or an ELITE signal sends one 'closed' event; a refused cancel sends nothing", async () => {
    h.tpsl = [];
    expect((await CANCEL(req("POST", { confirm: true }), ctx("free1"))).status).toBe(200);
    expect((await CANCEL(req("POST", { confirm: true }), ctx("elite1"))).status).toBe(200);
    expect((await CANCEL(req("POST", { confirm: true }), ctx("elite1"))).status).toBe(409);
    expect((await CANCEL(req("POST", {}), ctx("nope"))).status).toBe(400);
    expect(h.tpsl.map((c) => [(c[0] as { id: string }).id, c[1]])).toEqual([["free1", "CLOSED"], ["elite1", "CLOSED"]]);
  });
  it("a partial hit locks Edit (levels stay as published) and can still be cancelled or deleted", async () => {
    await st("free1", "TP1");
    expect((await PATCH(req("PATCH", EDIT), ctx("free1"))).status).toBe(409);
    expect(feed()[0].entryZone).toBe("100 - 102");
    expect((await CANCEL(req("POST", { confirm: true }), ctx("free1"))).status).toBe(200);
  });
  it("the bot's PATCH still records TP hits and closes FREE signals as before", async () => {
    h.lists[TRADE_FEED_KEY] = [trade("b1", { tradeId: "T1" })];
    const res = await BOT_PATCH(new Request("http://x/api/trade-feed", { method: "PATCH", body: JSON.stringify({ secret: "bot-secret", tradeId: "T1", hitLevels: ["TP1"] }) }));
    expect(res.status).toBe(200);
    expect(feed()[0]).toMatchObject({ status: "open", hitLevels: ["TP1"] });
  });
});

describe("Cancel keeps history, Delete removes permanently", () => {
  it("cancel: the signal stays in the feed, marked Cancelled, with its levels and a reason", async () => {
    expect((await CANCEL(req("POST", { confirm: true, reason: "setup invalid" }), ctx("free1"))).status).toBe(200);
    expect(feed()).toHaveLength(2);
    expect(feed()[0]).toMatchObject({ id: "free1", status: "closed", entryZone: "100 - 102", closing: { outcome: "CANCELLED", reason: "setup invalid" } });
    expect((await CANCEL(req("POST", { confirm: true }), ctx("free1"))).status).toBe(409);
  });
  it("delete: the signal and its confirmation count are gone; the other signal is untouched", async () => {
    h.hashes[CONFIRM_COUNTS_KEY] = { free1: 2, elite1: 1 };
    expect((await DELETE(req("DELETE", { confirm: true, published: true }), ctx("free1"))).status).toBe(200);
    expect(feed().map((t) => t.id)).toEqual(["elite1"]);
    expect(h.hashes[CONFIRM_COUNTS_KEY]).toEqual({ elite1: 1 });
  });
  it("delete writes the audit entry (owner, signal, tier, pair, status, hit levels, confirmations) before anything is removed", async () => {
    h.hashes[CONFIRM_COUNTS_KEY] = { free1: 2 };
    await STATUS(req("POST", { confirm: true, outcome: "TP1" }), ctx("free1"));
    const order: string[] = [];
    const { Redis } = await import("@upstash/redis");
    const proto = Redis.prototype as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    const origs = { lpush: proto.lpush, lrem: proto.lrem, hdel: proto.hdel };
    proto.lpush = function (this: unknown, k: unknown, ...r: unknown[]) { if (k === "atlas:admin-audit") order.push("audit"); return origs.lpush.call(this, k, ...r); };
    proto.lrem = function (this: unknown, ...a: unknown[]) { order.push("lrem"); return origs.lrem.apply(this, a); };
    proto.hdel = function (this: unknown, ...a: unknown[]) { order.push("hdel"); return origs.hdel.apply(this, a); };
    try {
      expect((await DELETE(req("DELETE", { confirm: true, published: true }), ctx("free1"))).status).toBe(200);
    } finally { Object.assign(proto, origs); }
    expect(order).toEqual(["audit", "lrem", "hdel"]);
    expect((h.lists["atlas:admin-audit"] ?? [])[0]).toMatchObject({ actor: "owner-1", action: "signal.delete", target: "free1", tier: "free", pair: "SOLUSDT", status: "open", hitLevels: ["TP1"], confirmations: 2 });
  });
  it("if the audit entry cannot be written nothing is deleted (fails closed)", async () => {
    h.hashes[CONFIRM_COUNTS_KEY] = { free1: 2 };
    h.failAudit = true;
    expect((await DELETE(req("DELETE", { confirm: true, published: true }), ctx("free1"))).status).toBe(500);
    expect(feed().map((t) => t.id)).toEqual(["free1", "elite1"]);
    expect(h.hashes[CONFIRM_COUNTS_KEY]).toEqual({ free1: 2 });
  });
  it("if the removal fails after the audit, the confirmation count is kept and a failure entry is logged", async () => {
    h.hashes[CONFIRM_COUNTS_KEY] = { free1: 2 };
    h.failLrem = true;
    expect((await DELETE(req("DELETE", { confirm: true, published: true }), ctx("free1"))).status).toBe(500);
    expect(h.hashes[CONFIRM_COUNTS_KEY]).toEqual({ free1: 2 });
    expect((h.lists["atlas:admin-audit"] ?? []).map((e) => (e as { action: string }).action)).toEqual(["signal.delete.failed", "signal.delete"]);
  });
  it("delete works on open, closed and cancelled signals and of either audience", async () => {
    await CANCEL(req("POST", { confirm: true }), ctx("elite1"));
    expect((await DELETE(req("DELETE", { confirm: true, published: true }), ctx("elite1"))).status).toBe(200);
    expect((await DELETE(req("DELETE", { confirm: true, published: true }), ctx("free1"))).status).toBe(200);
    expect(feed()).toHaveLength(0);
  });
  it("delete needs the confirmation flag, and without `published` it still only touches drafts (existing behaviour)", async () => {
    expect((await DELETE(req("DELETE", { published: true }), ctx("free1"))).status).toBe(400);
    expect((await DELETE(req("DELETE", { confirm: true }), ctx("free1"))).status).toBe(404);
    expect((await DELETE(req("DELETE", { confirm: true, published: true }), ctx("nope"))).status).toBe(404);
    expect(feed()).toHaveLength(2);
  });
  it("a draft is still deleted the old way", async () => {
    h.hashes["atlas:signal-drafts"] = { d1: { id: "d1", pair: "BTCUSDT" } };
    expect((await DELETE(req("DELETE", { confirm: true }), ctx("d1"))).status).toBe(200);
    expect(h.hashes["atlas:signal-drafts"]).toEqual({});
    expect(feed()).toHaveLength(2);
  });
});

describe("audience visibility and existing publishing are unchanged", () => {
  const get = async () => (await FEED(new Request("http://x/api/trade-feed"))).json();
  it("the owner feed route returns full FREE and ELITE signals to the owner only; the public feed does NOT grant the owner ELITE", async () => {
    const body = await (await OWNER_FEED(req("GET"))).json();
    expect(body.trades.map((t: { id: string }) => t.id).sort()).toEqual(["elite1", "free1"]);
    expect(body.trades.find((t: { id: string }) => t.id === "elite1").tp3).toBe("130");
    const pub = await get();
    expect(pub.trades.map((t: { id: string }) => t.id)).toEqual(["free1"]);
    expect(pub.locked).toHaveLength(1);
    expect(pub.canConfirm).toBeUndefined();
    asMember();
    expect((await OWNER_FEED(req("GET"))).status).toBe(404);
    h.userId = null;
    expect((await OWNER_FEED(req("GET"))).status).toBe(404);
  });
  it("an active ELITE member sees both and can confirm; a FREE member gets the ELITE signal as a locked preview without levels", async () => {
    asMember();
    const m = await get();
    expect(m.trades).toHaveLength(2);
    expect(m.canConfirm).toBe(true);
    h.userId = "free-9"; h.meta = {};
    const f = await get();
    expect(f.trades.map((t: { id: string }) => t.id)).toEqual(["free1"]);
    expect(f.locked).toHaveLength(1);
    expect(JSON.stringify(f)).not.toContain("\"tp3\":\"130\",\"reasoning\":\"why\",\"status\":\"open\",\"tier\":\"elite\"");
    expect(JSON.stringify(f.locked)).not.toMatch(/100 - 102|\"95\"|\"110\"/);
  });
  it("a signed-out request is still refused", async () => {
    h.userId = null;
    expect((await FEED(new Request("http://x/api/trade-feed"))).status).toBe(401);
  });
  it("owner publishing still works (FREE and ELITE) and notifies; the bot can still publish a FREE signal", async () => {
    const body = { pair: "ETHUSDT", direction: "Long", timeframe: "4H", entryZone: "100 - 102", invalidation: "95", tp1: "110", tp2: "", tp3: "", reasoning: "r", confirm: true, source: "trade-plan" };
    expect((await QUICK(new Request("http://x/q", { method: "POST", headers: { host: "x" }, body: JSON.stringify({ ...body, tier: "elite" }) }))).status).toBe(201);
    expect(h.newPush).toHaveLength(1);
    h.userId = null;
    const bot = await BOT_POST(new Request("http://x/api/trade-feed", { method: "POST", body: JSON.stringify({ secret: "bot-secret", pair: "ADAUSDT", direction: "Long", entryZone: "1", invalidation: "0.9", tp1: "1.2", tradeId: "T1" }) }));
    expect(bot.status).toBe(201);
    expect(feed()[0]).toMatchObject({ pair: "ADAUSDT" });
    expect(feed()[0].tier).toBe("free");
    expect(h.newPush).toHaveLength(2);
  });
});

describe("/tradefeedadmin redirect", () => {
  it("redirects /tradefeedadmin and everything under it to /trade-feed (temporary), keeping the old redirects", async () => {
    const r = (await nextConfig.redirects?.()) ?? [];
    expect(r).toContainEqual({ source: "/tradefeedadmin", destination: "/trade-feed", permanent: false });
    expect(r).toContainEqual({ source: "/tradefeedadmin/:path*", destination: "/trade-feed", permanent: false });
    expect(r).toContainEqual({ source: "/coins", destination: "/radar", permanent: false });
  });
});

describe("wiring and copy", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  it("/trade-feed uses owner controls from the Clerk owner check and no browser-side admin secret", () => {
    const p = read("app/trade-feed/page.tsx");
    expect(p).toContain("<OwnerSignalControls");
    expect(p).toContain("useIsOwner()");
    expect(p).toContain("/api/admin/signals/feed");
    expect(p).not.toMatch(/adminSecret|x-admin-secret|window\.prompt|admin=1|api\/trade-feed\/close|method: "DELETE"/);
  });
  it("the controls call exactly the four owner endpoints and keep Cancel and Delete separate", () => {
    const c = read("components/tradefeed/OwnerSignalControls.tsx");
    expect(c).toContain('adminApi(base, "PATCH"');
    expect(c).toContain('`${base}/status`');
    expect(c).toContain('`${base}/cancel`');
    expect(c).toContain('adminApi(base, "DELETE", { confirm: true, published: true })');
    expect(c).toContain('typeToConfirm="DELETE"');
    expect(c).toContain("ConfirmDialog");
  });
  it("EN, FR and AR have identical keys and placeholders", () => {
    const keys = (d: Record<string, string>) => Object.keys(d).sort();
    expect(keys(feedAdminFr)).toEqual(keys(feedAdminEn));
    expect(keys(feedAdminAr)).toEqual(keys(feedAdminEn));
    for (const k of keys(feedAdminEn)) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(ph(feedAdminFr[k]), k).toBe(ph(feedAdminEn[k]));
      expect(ph(feedAdminAr[k]), k).toBe(ph(feedAdminEn[k]));
    }
  });
});
