// RELEASE-1: notification lock safety, TP/SL TTL, and the direction rule of partial exits.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  users: ["u1", "u2"] as string[],
  failSends: false,
  sent: [] as Array<{ endpoint: string; ttl: number | undefined }>,
  plan: "free" as string,
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, _json: string, o?: { TTL?: number }) => {
      if (h.failSends) throw Object.assign(new Error("push service down"), { statusCode: 500 });
      h.sent.push({ endpoint: sub.endpoint, ttl: o?.TTL });
    },
  },
}));
vi.mock("@/lib/userStore", () => ({
  getRedis: () => ({
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => {
      if (o?.nx && h.kv.has(k)) return null;
      h.kv.set(k, v);
      return "OK";
    },
    get: async (k: string) => (k.endsWith(":prefs") ? { enabled: true, tradeFeed: true, market: true, educational: true, promotional: true, analyzerReset: true } : (h.kv.get(k) ?? null)),
    del: async (k: string) => (h.kv.delete(k) ? 1 : 0),
    smembers: async () => h.users,
    hgetall: async (k: string) => ({ d1: { endpoint: "https://fcm.googleapis.com/" + k.split(":")[1], keys: { p256dh: "p", auth: "a" }, lang: "en", createdAt: 1 } }),
    hdel: async () => 1,
  }),
}));
vi.mock("@/lib/plan", () => ({ getUserPlan: async () => h.plan, analyzeLimitForPlan: () => 3 }));
vi.mock("@/lib/binance", () => ({
  getAllTickers24h: async () => [],
  getTicker24h: async () => ({ priceChangePercent: "0" }),
  getSpotTradingSymbols: async () => new Set<string>(),
}));
vi.mock("@/lib/radar", () => ({
  buildRadarRows: () => [{ ticker: { symbol: "ABCUSDT" }, setup: "breakout", tags: ["highVolume"], change: 9 }],
}));

import { notifyFreeUsersAnalyzerReset, notifyEducational, notifyElitePromo, notifyRadarAlerts, notifyTpSlSubscribers, TP_SL_PUSH_TTL, DEFAULT_PUSH_TTL } from "@/lib/push";
import { applyExit, positionOf } from "@/lib/exits";
import { unrealizedPnl, type Trade } from "@/lib/journal";
import type { PublishedTrade } from "@/lib/tradeFeed";

beforeEach(() => {
  h.kv.clear(); h.sent.length = 0; h.failSends = false; h.plan = "free";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub"; process.env.VAPID_PRIVATE_KEY = "priv"; process.env.VAPID_SUBJECT = "mailto:a@b.c";
});

const runs: Array<[string, () => Promise<{ sent: number; reason: string }>, string]> = [
  ["analyzer reset", notifyFreeUsersAnalyzerReset, "already-sent-today"],
  ["educational", notifyEducational, "already-sent-today"],
  ["elite promo", notifyElitePromo, "already-sent-this-week"],
  ["radar alerts", notifyRadarAlerts, "no-new-setups"],
];

describe.each(runs)("lock safety: %s", (_n, run, blockedReason) => {
  it("a failed send releases the lock so the next run retries, then locks after success", async () => {
    h.plan = "free";
    h.failSends = true;
    const failed = await run();
    expect(failed.sent).toBe(0);
    expect(h.kv.size).toBe(0); // lock released
    h.failSends = false;
    const retry = await run();
    expect(retry.sent).toBeGreaterThan(0);
    expect(h.sent.length).toBeGreaterThan(0);
    expect(h.kv.size).toBeGreaterThan(0); // locked after a real delivery
  });
  it("duplicate prevention: a second run after a successful send sends nothing", async () => {
    const first = await run();
    expect(first.sent).toBeGreaterThan(0);
    const n = h.sent.length;
    const second = await run();
    expect(second.sent).toBe(0);
    expect(second.reason).toBe(blockedReason);
    expect(h.sent.length).toBe(n);
  });
  it("concurrent runs: the lock is claimed first, so only one run sends", async () => {
    const [a, b] = await Promise.all([run(), run()]);
    expect([a.sent, b.sent].filter((x) => x > 0).length).toBe(1);
  });
});

describe("lock safety: no opted-in recipients keeps the lock (nothing to retry)", () => {
  it("empty user list", async () => {
    h.users.splice(0, 2);
    await notifyEducational();
    expect(h.kv.size).toBe(1);
    h.users.push("u1", "u2");
  });
});

describe("TP/SL expiry", () => {
  const trade = { id: "t1", createdAt: 1, pair: "BTC/USDT", direction: "Long", timeframe: "4H", entryZone: "1 - 2", invalidation: "1", status: "open" } as unknown as PublishedTrade;
  it("TP/SL alerts use a 12 hour TTL; other sends keep 1 hour", async () => {
    expect(TP_SL_PUSH_TTL).toBe(43200);
    expect(DEFAULT_PUSH_TTL).toBe(3600);
    await notifyTpSlSubscribers(trade, "TP1");
    expect(h.sent.length).toBe(2);
    expect(h.sent.every((s) => s.ttl === 43200)).toBe(true);
    h.sent.length = 0;
    await notifyEducational();
    expect(h.sent.every((s) => s.ttl === 3600)).toBe(true);
  });
});

describe("partial exits follow the trade direction", () => {
  const base = { id: "x", date: "2026-01-01", pair: "BTC/USDT", entry: 100, stop: 110, target: 80, exit: null, size: 10, status: "open", exitStrategy: "tp3", tp1: 90, tp2: 85, tp3: 80 } as unknown as Trade;
  it("Long is unchanged", () => {
    const t = { ...base, side: "Long", stop: 90, tp3: 120 } as Trade;
    expect(positionOf(t, 110).unrealizedPnl).toBe(100);
    const r = applyExit({ ...t, exitStrategy: "split" } as Trade, { level: "TP1", price: 110, date: "2026-01-02" });
    expect(r.ok && positionOf(r.trade, 110).realizedPnl).toBe(30); // 3 units x +10
  });
  it("legacy Short: a falling price is a gain, in realized, unrealized and the journal helper", () => {
    const t = { ...base, side: "Short" } as Trade;
    expect(positionOf(t, 90).unrealizedPnl).toBe(100);
    const r = applyExit({ ...t, exitStrategy: "split" } as Trade, { level: "TP1", price: 90, date: "2026-01-02" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const p = positionOf(r.trade, 90);
      expect(p.realizedPnl).toBe(30);
      expect(p.unrealizedPnl).toBe(70);
      expect(unrealizedPnl(r.trade, 90)).toBe(70); // journal.ts and exits.ts now agree
    }
  });
});
