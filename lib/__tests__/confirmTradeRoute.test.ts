// ELITE-CONFIRM-v1: the REAL Confirm Trade route and the REAL lib/plan.ts. Only Clerk, Upstash and the
// exchange price call are fakes. Proves the rules, not Upstash/Binance themselves.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  userId: "member_a" as string | null,
  plans: {} as Record<string, unknown>,
  feed: [] as Record<string, unknown>[],
  kv: new Map<string, unknown>(),
  hashes: new Map<string, Map<string, unknown>>(),
  failJournalSet: false,
  ticker: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: h.userId }),
  clerkClient: async () => ({ users: { getUser: async (id: string) => ({ privateMetadata: { plan: h.plans[id] } }) } }),
}));
const fakeRedis = () => ({
  lrange: async () => structuredClone(h.feed),
  get: async (k: string) => (h.kv.has(k) ? structuredClone(h.kv.get(k)) : null),
  set: async (k: string, v: unknown) => {
    if (h.failJournalSet && k.endsWith(":journal")) throw new Error("redis down");
    h.kv.set(k, structuredClone(v));
    return "OK";
  },
  hget: async (k: string, f: string) => structuredClone(h.hashes.get(k)?.get(f) ?? null),
  hsetnx: async (k: string, f: string, v: unknown) => {
    const m = h.hashes.get(k) ?? new Map();
    h.hashes.set(k, m);
    if (m.has(f)) return 0;
    m.set(f, structuredClone(v));
    return 1;
  },
  hgetall: async (k: string) => { const m = h.hashes.get(k); return m ? structuredClone(Object.fromEntries(m)) : null; },
  hincrby: async (k: string, f: string, n: number) => {
    const m = h.hashes.get(k) ?? new Map();
    h.hashes.set(k, m);
    const v = Number(m.get(f) ?? 0) + n;
    m.set(f, v);
    return v;
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
vi.mock("@/lib/binance", () => ({ getTicker24h: (s: string) => h.ticker(s) }));

import { POST } from "@/app/api/me/confirm-trade/route";
import { POST as watchPost } from "@/app/api/me/signals/route";

const signal = (over: Record<string, unknown> = {}) => ({
  id: "sig-elite", createdAt: 1, pair: "SOL/USDT", direction: "Long", timeframe: "4H", entryZone: "100 - 110", invalidation: "95",
  tp1: "120", tp2: "130", tp3: "140", reasoning: "r", status: "open", tier: "elite", ...over,
});
const price = (p: number | string, ageMs = 0) => ({ lastPrice: String(p), closeTime: Date.now() - ageMs });
const confirm = (body: Record<string, unknown> = {}) =>
  POST(new Request("http://x/api/me/confirm-trade", { method: "POST", body: JSON.stringify({ signalId: "sig-elite", entry: 105, invested: 500, ...body }) }));
const journalOf = (u = "member_a") => (h.kv.get(`user:${u}:journal`) as Array<Record<string, unknown>> | undefined) ?? [];
const confirmationsOf = (u = "member_a") => h.hashes.get(`user:${u}:confirmations`);

beforeEach(() => {
  h.userId = "member_a";
  h.plans = { member_a: "elite", member_b: "elite", free_user: "free", analyzer_user: "analyzer", expired_user: "expired" };
  h.feed = [signal(), signal({ id: "sig-free", tier: "free", tradeId: "T1" }), signal({ id: "sig-legacy", tier: undefined, tradeId: "T2" })];
  h.kv.clear();
  h.hashes.clear();
  h.failJournalSet = false;
  h.ticker.mockReset();
  h.ticker.mockResolvedValue(price(105));
});

describe("access: signed-in members; ELITE signals need an active ELITE plan", () => {
  it("signed-out is 401", async () => {
    h.userId = null;
    expect((await confirm()).status).toBe(401);
  });
  it("FREE, expired and unknown plans cannot confirm an ELITE signal (404, same as an unknown id) and nothing is created", async () => {
    for (const u of ["free_user", "analyzer_user", "expired_user", "nobody"]) {
      h.userId = u;
      const res = await confirm();
      expect(res.status, u).toBe(404);
      expect(((await res.json()) as { error: string }).error).toBe("signal_not_found");
      expect(journalOf(u)).toEqual([]);
      expect(confirmationsOf(u)).toBeUndefined();
    }
    expect(h.ticker).not.toHaveBeenCalled();
    expect(h.hashes.get("atlas:signal-confirmations")).toBeUndefined();
  });
  it("a FREE-plan member CAN confirm a FREE signal, through the same price / zone / duplicate checks", async () => {
    h.userId = "free_user";
    const ok = await confirm({ signalId: "sig-free" });
    expect(ok.status).toBe(201);
    expect(journalOf("free_user")[0]).toMatchObject({ signalId: "sig-free", entry: 105, invested: 500, status: "open" });
    expect((await confirm({ signalId: "sig-free" })).status).toBe(409);
    h.userId = "member_b";
    h.ticker.mockResolvedValue(price(111)); // above the zone
    expect((await confirm({ signalId: "sig-free" })).status).toBe(422);
    h.ticker.mockResolvedValue({ lastPrice: "105" }); // no timestamp: unavailable
    expect((await confirm({ signalId: "sig-free" })).status).toBe(503);
    expect(journalOf("member_b")).toEqual([]);
  });
});

describe("confirmation count (unique per signal, no member data)", () => {
  const counts = () => h.hashes.get("atlas:signal-confirmations");
  it("counts one per member and signal; duplicates and blocked attempts do not count", async () => {
    await confirm();
    expect(counts()?.get("sig-elite")).toBe(1);
    expect((await confirm()).status).toBe(409);
    expect(counts()?.get("sig-elite")).toBe(1);
    h.userId = "member_b";
    h.ticker.mockResolvedValue(price(111));
    expect((await confirm()).status).toBe(422);
    expect(counts()?.get("sig-elite")).toBe(1);
    h.ticker.mockResolvedValue(price(105));
    expect((await confirm()).status).toBe(201);
    expect(counts()?.get("sig-elite")).toBe(2);
  });
  it("two simultaneous confirmations by one member count once", async () => {
    await Promise.all([confirm(), confirm()]);
    expect(counts()?.get("sig-elite")).toBe(1);
  });
  it("the stored count is a bare number: no member id, name or trade data", async () => {
    await confirm();
    expect(JSON.stringify([...(counts() ?? [])])).toBe('[["sig-elite",1]]');
  });
});

describe("entry zone boundaries (fresh price, both ends inclusive)", () => {
  it("price exactly at the MINIMUM is allowed", async () => {
    h.ticker.mockResolvedValue(price(100));
    expect((await confirm()).status).toBe(201);
  });
  it("price exactly at the MAXIMUM is allowed", async () => {
    h.ticker.mockResolvedValue(price(110));
    expect((await confirm()).status).toBe(201);
  });
  it("price inside the zone is allowed", async () => {
    h.ticker.mockResolvedValue(price(104.2));
    expect((await confirm()).status).toBe(201);
  });
  it("price BELOW the minimum is blocked, with a reason and the numbers", async () => {
    h.ticker.mockResolvedValue(price(99.99));
    const res = await confirm();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "below_zone", price: 99.99, zone: { low: 100, high: 110 } });
    expect(journalOf()).toEqual([]);
    expect(confirmationsOf()).toBeUndefined();
  });
  it("price ABOVE the maximum is blocked, with a reason and the numbers", async () => {
    h.ticker.mockResolvedValue(price(110.01));
    const res = await confirm();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "above_zone", price: 110.01, zone: { low: 100, high: 110 } });
    expect(journalOf()).toEqual([]);
  });
  it("an unreadable entry zone blocks", async () => {
    h.feed = [signal({ entryZone: "wait for a dip" })];
    expect(((await (await confirm()).json()) as { error: string }).error).toBe("zone_unreadable");
    expect(journalOf()).toEqual([]);
  });
});

describe("price data problems block confirmation", () => {
  const blocked = async (code: string) => {
    const res = await confirm();
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe(code);
    expect(journalOf()).toEqual([]);
    expect(confirmationsOf()).toBeUndefined();
  };
  it("the price service fails", async () => {
    h.ticker.mockRejectedValue(new Error("down"));
    await blocked("price_unavailable");
  });
  it("the price service returns garbage", async () => {
    for (const bad of [null, {}, { lastPrice: "abc", closeTime: Date.now() }, { lastPrice: "0", closeTime: Date.now() }]) {
      h.ticker.mockResolvedValue(bad);
      await blocked("price_unavailable");
    }
  });
  it("the price has no exchange timestamp (freshness unprovable)", async () => {
    h.ticker.mockResolvedValue({ lastPrice: "105" });
    await blocked("price_unavailable");
  });
  it("the price is stale", async () => {
    h.ticker.mockResolvedValue(price(105, 5 * 60_000));
    await blocked("price_stale");
  });
  it("an unsupported pair cannot be priced", async () => {
    h.feed = [signal({ pair: "BTC/EUR" })];
    await blocked("price_unavailable");
  });
});

describe("the price is fetched fresh on every press and never taken from the client", () => {
  it("each Confirm press asks the exchange again; a later in-zone press succeeds after an earlier blocked one", async () => {
    h.ticker.mockResolvedValueOnce(price(130)).mockResolvedValueOnce(price(106));
    expect((await confirm()).status).toBe(422);
    expect((await confirm()).status).toBe(201);
    expect(h.ticker).toHaveBeenCalledTimes(2);
    expect(h.ticker).toHaveBeenCalledWith("SOLUSDT");
  });
  it("a price (or zone) supplied by the browser is ignored", async () => {
    h.ticker.mockResolvedValue(price(130));
    const res = await confirm({ price: 105, livePrice: 105, checkedPrice: 105, entryZone: "100 - 200" });
    expect(res.status).toBe(422);
    expect(journalOf()).toEqual([]);
  });
});

describe("required amounts", () => {
  it("entry price and invested amount are both required and positive", async () => {
    for (const bad of [{ entry: undefined }, { entry: 0 }, { entry: "abc" }, { invested: undefined }, { invested: -5 }, { invested: 0 }]) {
      const res = await confirm(bad);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("invalid_amount");
    }
    expect(h.ticker).not.toHaveBeenCalled();
    expect(journalOf()).toEqual([]);
  });
  it("typed numbers such as \"1,250.5\" are understood", async () => {
    expect((await confirm({ entry: "105.5", invested: "1,250.5" })).status).toBe(201);
    expect(journalOf()[0]).toMatchObject({ entry: 105.5, invested: 1250.5 });
  });
  it("a missing signal id is rejected", async () => expect((await confirm({ signalId: "" })).status).toBe(400));
});

describe("which signals can be confirmed", () => {
  it("FREE-tier and legacy untiered signals are confirmable; an unknown id is not found", async () => {
    for (const id of ["sig-free", "sig-legacy"]) expect((await confirm({ signalId: id })).status, id).toBe(201);
    const res = await confirm({ signalId: "nope" });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("signal_not_found");
    expect(journalOf()).toHaveLength(2);
  });
  it("closed or stopped-out signals cannot be confirmed", async () => {
    h.feed = [signal({ status: "closed" })];
    expect((await confirm()).status).toBe(409);
    h.feed = [signal({ hitLevels: ["SL"] })];
    expect((await confirm()).status).toBe(409);
    expect(journalOf()).toEqual([]);
  });
  it("spot only: a Short signal is refused", async () => {
    h.feed = [signal({ direction: "Short" })];
    expect((await confirm()).status).toBe(400);
  });
});

describe("successful confirmation creates the personal Journal trade", () => {
  it("creates an Open spot trade linked by Signal ID, with the member's own entry and investment", async () => {
    h.ticker.mockResolvedValue(price(107));
    const res = await confirm({ entry: 106.4, invested: 532 });
    expect(res.status).toBe(201);
    const body = await res.json();
    const [trade] = journalOf();
    expect(journalOf()).toHaveLength(1);
    expect(body.trade).toEqual(trade);
    expect(trade).toMatchObject({
      pair: "SOLUSDT", side: "Long", status: "open", source: "signal", signalId: "sig-elite",
      entry: 106.4, invested: 532, exit: null,
    });
    expect(trade.size as number).toBeCloseTo(532 / 106.4, 8);
    expect((trade.signal as { id: string }).id).toBe("sig-elite");
    expect(body.checkedPrice).toBe(107);
    // Confirmation record for duplicate protection / audit.
    expect(confirmationsOf()!.get("sig-elite")).toMatchObject({ signalId: "sig-elite", tradeId: trade.id, entry: 106.4, invested: 532, checkedPrice: 107 });
  });
  it("keeps the member's numbers separate from the official levels", async () => {
    await confirm({ entry: 101, invested: 300 });
    const [trade] = journalOf() as Array<{ entry: number; invested: number; signal: { imported: Record<string, string> } }>;
    expect(trade.entry).toBe(101); // member's fill, not the zone top (110) or any official level
    expect(trade.invested).toBe(300);
    expect(trade.signal.imported).toEqual({ entryZone: "100 - 110", invalidation: "95", tp1: "120", tp2: "130", tp3: "140" });
  });
  it("never changes the official signal or other signals", async () => {
    const before = JSON.stringify(h.feed);
    await confirm();
    expect(JSON.stringify(h.feed)).toBe(before);
  });
  it("never touches another member's records", async () => {
    h.kv.set("user:member_b:journal", [{ id: "b1", pair: "ETHUSDT" }]);
    await confirm();
    expect(journalOf("member_b")).toEqual([{ id: "b1", pair: "ETHUSDT" }]);
    expect(confirmationsOf("member_b")).toBeUndefined();
  });
  it("keeps the member's existing Journal trades and puts the new one first", async () => {
    h.kv.set("user:member_a:journal", [{ id: "old", pair: "BTCUSDT" }]);
    await confirm();
    expect(journalOf().map((t) => t.id)).toEqual([expect.any(String), "old"]);
    expect(journalOf()[0].signalId).toBe("sig-elite");
  });
  it("a different member can confirm the same signal independently", async () => {
    expect((await confirm()).status).toBe(201);
    h.userId = "member_b";
    expect((await confirm()).status).toBe(201);
    expect(journalOf("member_a")).toHaveLength(1);
    expect(journalOf("member_b")).toHaveLength(1);
  });
});

describe("duplicate confirmations are prevented", () => {
  it("a second confirmation of the same signal is rejected and creates nothing", async () => {
    const first = await confirm();
    const firstTrade = (await first.json()).trade;
    const second = await confirm({ entry: 108, invested: 999 });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "already_confirmed", tradeId: firstTrade.id });
    expect(journalOf()).toHaveLength(1);
    expect(journalOf()[0]).toMatchObject({ entry: 105, invested: 500 }); // the first confirmation is untouched
    expect(h.ticker).toHaveBeenCalledTimes(1); // rejected before any price is fetched
  });
  it("two simultaneous presses create exactly one trade", async () => {
    const results = await Promise.all([confirm(), confirm()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(journalOf()).toHaveLength(1);
  });
  it("a signal already linked to a Journal trade cannot be confirmed again", async () => {
    h.kv.set("user:member_a:journal", [{ id: "existing", signalId: "sig-elite" }]);
    const res = await confirm();
    expect(res.status).toBe(409);
    expect(journalOf()).toEqual([{ id: "existing", signalId: "sig-elite" }]);
  });
  it("a failed Journal save releases the claim so the member can retry", async () => {
    h.failJournalSet = true;
    expect((await confirm()).status).toBe(500);
    expect(confirmationsOf()!.has("sig-elite")).toBe(false);
    h.failJournalSet = false;
    expect((await confirm()).status).toBe(201);
    expect(journalOf()).toHaveLength(1);
  });
});

describe("watching a signal never creates a personal trade", () => {
  it("Watch Signal writes only the watch list", async () => {
    h.userId = "member_a";
    const res = await watchPost(new Request("http://x/api/me/signals", { method: "POST", body: JSON.stringify({ op: "watch", id: "sig-elite", pair: "SOL/USDT", status: "open", hitLevels: [] }) }));
    expect(res.status).toBe(200);
    expect([...h.kv.keys()]).toEqual(["user:member_a:signals"]);
    expect(journalOf()).toEqual([]);
    expect(confirmationsOf()).toBeUndefined();
  });
});

describe("EXIT-STRATEGY: exit strategy at confirmation", () => {
  const stored = () => journalOf()[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  it("stores the chosen strategy with the personal trade; the default is the 30/40/30 split", async () => {
    await confirm({ exitStrategy: "tp3" });
    expect(stored().exitStrategy).toBe("tp3");
    h.userId = "member_b";
    await confirm();
    expect(journalOf("member_b")[0].exitStrategy).toBe("split");
  });
  it("an unknown strategy is refused and nothing is created", async () => {
    const res = await confirm({ exitStrategy: "yolo" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_strategy");
    expect(journalOf()).toEqual([]);
    expect(h.ticker).not.toHaveBeenCalled();
  });
  it("the official signal is untouched by the personal strategy", async () => {
    const before = JSON.stringify(h.feed);
    await confirm({ exitStrategy: "tp3" });
    expect(JSON.stringify(h.feed)).toBe(before);
    expect(stored().signal.latest).toMatchObject({ invalidation: "95", tp1: "120" });
  });
});
