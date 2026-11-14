// PHASE-3A: Watchlist limits through the real route + real atomic updater. Only Clerk-backed entitlements and Redis are fakes;
// the fake Redis eval() is a JS twin of WATCHLIST_WRITE_SCRIPT and yields to other requests between every call, so requests
// really interleave. The real Lua script is run on a real Redis in watchlistLua.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  db: new Map<string, unknown>(),
  user: "u1",
  ents: {} as Record<string, { plan: string; status: string }>,
  evalCalls: 0,
}));

const tick = () => new Promise<void>((r) => setImmediate(r));
const redis = {
  get: async (k: string) => { await tick(); return structuredClone(h.db.get(k) ?? null); },
  set: async (k: string, v: unknown) => { h.db.set(k, v); return "OK"; },
  eval: async (_s: string, keys: string[], args: string[]) => {
    await tick();
    h.evalCalls++;
    const rev = Number(h.db.get(keys[1]) ?? 0);
    if (rev !== Number(args[0])) return 0;
    const before = ((h.db.get(keys[0]) as { items?: unknown[] } | undefined)?.items ?? []).length;
    const next = JSON.parse(args[1]) as { items: unknown[] };
    if (next.items.length > Number(args[2]) && next.items.length > before) return -1;
    h.db.set(keys[0], next);
    h.db.set(keys[1], rev + 1);
    return 1;
  },
};
vi.mock("@/lib/userStore", () => ({ requireUser: async () => ({ userId: h.user, redis }) }));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: async (id: string) => h.ents[id] ?? { plan: "free", status: "verified" } }));

import { GET, POST } from "@/app/api/me/watchlist/route";
import { watchlistKey } from "@/lib/watchlistAtomic";

const post = (body: unknown) => POST(new Request("http://x/api/me/watchlist", { method: "POST", body: JSON.stringify(body) }));
const add = (symbol: string) => post({ op: "add", symbol });
const items = () => ((h.db.get(watchlistKey(h.user)) as { items: { symbol: string }[] } | undefined)?.items ?? []).map((i) => i.symbol);
const seed = (n: number, user = h.user) => h.db.set(watchlistKey(user), { items: Array.from({ length: n }, (_, i) => ({ symbol: `S${i}USDT`, addedAt: 1 })), seen: {} });

beforeEach(() => {
  h.db.clear();
  h.user = "u1";
  h.ents = {};
  h.evalCalls = 0;
});

describe("limits", () => {
  it("Free allows 5 and rejects the 6th with 409 and the limit", async () => {
    for (let i = 0; i < 5; i++) expect((await add(`F${i}`)).status).toBe(200);
    const res = await add("F5");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "limit", limit: 5, plan: "free" });
    expect(items()).toHaveLength(5);
  });
  it("ELITE allows 50 and rejects the 51st", async () => {
    h.ents.u1 = { plan: "elite", status: "verified" };
    seed(49);
    expect((await add("FIFTY")).status).toBe(200);
    const res = await add("FIFTYONE");
    expect(res.status).toBe(409);
    expect((await res.json()).limit).toBe(50);
    expect(items()).toHaveLength(50);
  });
  it("adding a coin that is already there is fine at the limit and writes nothing", async () => {
    seed(5);
    const before = h.evalCalls;
    expect((await add("S0")).status).toBe(200);
    expect(h.evalCalls).toBe(before);
  });
  it("GET reports the configured limit and plan", async () => {
    expect(await (await GET()).json()).toMatchObject({ limit: 5, plan: "free" });
    h.ents.u1 = { plan: "elite", status: "verified" };
    expect(await (await GET()).json()).toMatchObject({ limit: 50, plan: "elite" });
  });
});

describe("downgrade", () => {
  it("an ex-ELITE list of 30 coins is kept untouched; removing works; adding is refused until under 5", async () => {
    seed(30); // plan is now free
    expect((await (await GET()).json()).items).toHaveLength(30);
    expect((await add("NEWCOIN")).status).toBe(409);
    expect(items()).toHaveLength(30);
    for (let i = 0; i < 25; i++) expect((await post({ op: "remove", symbol: `S${i}` })).status).toBe(200);
    expect(items()).toHaveLength(5);
    expect((await add("NEWCOIN")).status).toBe(409); // at 5 = full
    expect((await post({ op: "remove", symbol: "S25" })).status).toBe(200);
    expect((await add("NEWCOIN")).status).toBe(200);
    expect(items()).toHaveLength(5);
  });
  it("'seen' and remove keep working above the limit; merge adds nothing but does not trim", async () => {
    seed(8);
    expect((await post({ op: "seen", seen: { S1USDT: "breakout" } })).status).toBe(200);
    const m = await (await post({ op: "merge", symbols: ["AAA", "BBB"] })).json();
    expect(m.dropped).toBe(2);
    expect(m.items).toHaveLength(8);
    expect(items()).toHaveLength(8);
  });
});

describe("unverified membership", () => {
  beforeEach(() => { h.ents.u1 = { plan: "free", status: "unverified" }; });
  it("add and merge return a retryable 503, never Free's 409, and change nothing", async () => {
    seed(2);
    for (const body of [{ op: "add", symbol: "BTC" }, { op: "merge", symbols: ["ETH"] }]) {
      const res = await post(body);
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("30");
      expect(await res.json()).toMatchObject({ code: "membership_unverified", retryable: true });
    }
    expect(items()).toHaveLength(2);
    expect(h.evalCalls).toBe(0);
  });
  it("an ELITE member with 20 coins is never shown a Free limit, and can still remove", async () => {
    seed(20);
    const g = await (await GET()).json();
    expect(g.items).toHaveLength(20);
    expect(g.unverified).toBe(true);
    expect(g.limit).toBeUndefined();
    const r = await post({ op: "remove", symbol: "S0" });
    expect(r.status).toBe(200);
    expect(items()).toHaveLength(19);
  });
});

describe("concurrency", () => {
  it("20 parallel adds on a Free list: exactly 5 succeed, the rest get 409, nothing is lost or duplicated", async () => {
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => add(`P${i}`)));
    const codes = res.map((r) => r.status);
    expect(codes.filter((c) => c === 200)).toHaveLength(5);
    expect(codes.filter((c) => c === 409).length + codes.filter((c) => c === 503).length).toBe(15);
    expect(items()).toHaveLength(5);
    expect(new Set(items()).size).toBe(5);
  });
  it("parallel adds below the limit all land (no lost update) and existing coins survive", async () => {
    h.ents.u1 = { plan: "elite", status: "verified" };
    seed(10);
    const res = await Promise.all(Array.from({ length: 8 }, (_, i) => add(`N${i}`)));
    for (const r of res) expect([200, 503]).toContain(r.status);
    const ok = res.filter((r) => r.status === 200).length;
    expect(items()).toHaveLength(10 + ok);
    for (let i = 0; i < 10; i++) expect(items()).toContain(`S${i}USDT`);
  });
  it("an add racing a remove keeps both effects", async () => {
    h.ents.u1 = { plan: "elite", status: "verified" };
    seed(3);
    await Promise.all([add("NEWONE"), post({ op: "remove", symbol: "S0" })]);
    expect(items().sort()).toEqual(["NEWONEUSDT", "S1USDT", "S2USDT"]);
  });
  it("two users never affect each other", async () => {
    h.user = "a"; seed(5, "a");
    h.user = "b";
    expect((await add("XRP")).status).toBe(200);
    expect(items()).toEqual(["XRPUSDT"]);
  });
});

describe("merge on sign-in", () => {
  it("adds what fits, skips duplicates, and reports exactly how many were dropped", async () => {
    seed(3);
    const body = await (await post({ op: "merge", symbols: ["S0", "ADA", "BNB", "CAKE", "DOGE", "ADA"] })).json();
    expect(body.items).toHaveLength(5);
    expect(body.dropped).toBe(2); // ADA, BNB fit; CAKE, DOGE dropped; S0 and the repeated ADA are duplicates, not drops
  });
  it("ELITE merge of 60 browser coins into an empty account keeps 50 and reports 10", async () => {
    h.ents.u1 = { plan: "elite", status: "verified" };
    const body = await (await post({ op: "merge", symbols: Array.from({ length: 60 }, (_, i) => `M${i}`) })).json();
    expect(body.items).toHaveLength(50);
    expect(body.dropped).toBe(10);
  });
});

describe("single source of truth", () => {
  it("no hard-coded Watchlist numbers outside lib/entitlementConfig.ts", () => {
    for (const f of ["lib/watchlistConfig.ts", "app/api/me/watchlist/route.ts", "lib/watchlistAtomic.ts"]) {
      expect(readFileSync(f, "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ""), f).not.toMatch(/\b(?:free|elite)\s*:\s*\d+/);
    }
    expect(readFileSync("lib/watchlistConfig.ts", "utf8")).toContain('limitFor(plan, "watchlistItems")');
    expect(readFileSync("app/elite/page.tsx", "utf8")).toContain("PLAN_LIMITS.free.watchlistItems");
    expect(readFileSync("app/elite/page.tsx", "utf8")).not.toContain("10 coins");
  });
  it("is unused by NextResponse type import only (sanity)", () => { expect(typeof NextResponse.json).toBe("function"); });
});
