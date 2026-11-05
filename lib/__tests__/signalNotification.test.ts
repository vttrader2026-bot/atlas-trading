// SIGNAL-NOTIFY-v1: one unified, detail-free notification for every new signal (FREE and ELITE).
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  users: [] as string[],
  subs: {} as Record<string, Record<string, unknown>>,
  sent: [] as Array<{ endpoint: string; payload: { title: string; body: string; url: string; tag?: string } }>,
  cmc: vi.fn(),
  planLookups: 0,
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, json: string) => { h.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(json) }); },
  },
}));
vi.mock("@/lib/userStore", () => ({
  getRedis: () => ({
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => {
      if (o?.nx && h.kv.has(k)) return null;
      h.kv.set(k, v);
      return "OK";
    },
    get: async (k: string) => (h.kv.has(k) ? h.kv.get(k) : null),
    smembers: async () => h.users,
    hgetall: async (k: string) => h.subs[k.split(":")[1]] ?? null,
    hdel: async () => 1,
  }),
}));
vi.mock("@/lib/plan", () => ({ getUserPlan: async () => { h.planLookups++; return "elite"; } }));
vi.mock("@/lib/coinmarketcap", () => ({ getCoinNameFromCmc: (s: string) => h.cmc(s) }));

import { notifyTradeSubscribers, tradePayload } from "@/lib/push";
import { baseSymbol, coinNameFor } from "@/lib/coinName";
import type { PublishedTrade } from "@/lib/tradeFeed";

const sig = (over: Partial<PublishedTrade> = {}): PublishedTrade => ({
  id: "sig-1", createdAt: 1, pair: "BTC/USDT", direction: "Long", timeframe: "4H", entryZone: "61,200 - 61,800", invalidation: "59,800",
  tp1: "63,000", tp2: "64,500", tp3: "66,000", reasoning: "secret reasoning", status: "open", ...over,
});
const subFor = (u: string) => ({ [`dev-${u}`]: { endpoint: `https://fcm.googleapis.com/${u}`, keys: { p256dh: "p", auth: "a" }, lang: "ar", createdAt: 1 } });

beforeEach(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
  process.env.VAPID_SUBJECT = "mailto:a@b.c";
  h.kv.clear();
  h.users = ["free_u", "elite_u", "analyzer_u"];
  h.subs = { free_u: subFor("free_u"), elite_u: subFor("elite_u"), analyzer_u: subFor("analyzer_u") };
  for (const u of h.users) h.kv.set(`user:${u}:prefs`, { enabled: true, tradeFeed: true });
  h.sent = [];
  h.planLookups = 0;
  h.cmc.mockReset();
  h.cmc.mockResolvedValue(null);
});

describe("payload: exact wording, no trade details", () => {
  it("title and body match the specification", () => {
    expect(tradePayload(sig(), "en", "Bitcoin")).toMatchObject({ title: "⚡ BUY SIGNAL", body: "New signal: Bitcoin (BTC)" });
    expect(tradePayload(sig(), "ar", "Bitcoin")).toMatchObject({ title: "⚡ BUY SIGNAL", body: "New signal: Bitcoin (BTC)" });
  });
  it("never contains the entry zone, entry price, SL, TP, reasoning or direction", () => {
    const text = JSON.stringify(tradePayload(sig(), "en", "Bitcoin"));
    for (const secret of ["61,200", "61,800", "59,800", "63,000", "64,500", "66,000", "secret reasoning", "Long", "Entry", "TP", "SL"]) expect(text).not.toContain(secret);
  });
  it("is identical for a FREE and an ELITE signal", () => {
    expect(tradePayload(sig({ tier: "free" }), "en", "Bitcoin")).toEqual(tradePayload(sig({ tier: "elite" }), "en", "Bitcoin"));
  });
  it("falls back to the symbol alone when the coin name is unknown", () => {
    expect(tradePayload(sig({ pair: "ZRO/USDT" }), "en", null).body).toBe("New signal: ZRO");
    expect(tradePayload(sig({ pair: "ZROUSDT" }), "en").body).toBe("New signal: ZRO");
  });
  it("opens the Trade Feed and collapses repeats of the same signal on a device", () => {
    expect(tradePayload(sig(), "en")).toMatchObject({ url: "https://www.atlastrading.app/trade-feed", tag: "signal-sig-1" });
  });
});

describe("coin names", () => {
  it("baseSymbol understands the published pair formats", () => {
    expect(baseSymbol("BTC/USDT")).toBe("BTC");
    expect(baseSymbol("beamxusdt")).toBe("BEAMX");
    expect(baseSymbol("USDT")).toBe("USDT");
    expect(baseSymbol("")).toBeNull();
    expect(baseSymbol("a b/../x")).toBeNull();
  });
  it("big coins need no lookup; others are looked up once and cached", async () => {
    const redis = { get: async (k: string) => (h.kv.get(k) as string) ?? null, set: async (k: string, v: unknown) => { h.kv.set(k, v); return "OK"; } };
    const lookup = vi.fn().mockResolvedValue("LayerZero");
    expect(await coinNameFor("BTC", redis as never, lookup)).toBe("Bitcoin");
    expect(lookup).not.toHaveBeenCalled();
    expect(await coinNameFor("ZRO", redis as never, lookup)).toBe("LayerZero");
    expect(await coinNameFor("ZRO", redis as never, lookup)).toBe("LayerZero");
    expect(lookup).toHaveBeenCalledTimes(1);
  });
  it("a failing lookup gives null and is not cached", async () => {
    const redis = { get: async () => null, set: async (k: string, v: unknown) => { h.kv.set(k, v); return "OK"; } };
    expect(await coinNameFor("ZRO", redis as never, async () => { throw new Error("down"); })).toBeNull();
    expect(h.kv.has("coin:name:ZRO")).toBe(false);
  });
});

describe("delivery: same notification to everyone who receives signal notifications", () => {
  it("FREE and ELITE signals reach the same users with the same text, regardless of membership tier", async () => {
    h.cmc.mockResolvedValue("LayerZero");
    await notifyTradeSubscribers(sig({ id: "a", pair: "ZRO/USDT", tier: "free" }));
    const free = h.sent.map((s) => ({ endpoint: s.endpoint, title: s.payload.title, body: s.payload.body }));
    h.sent = [];
    await notifyTradeSubscribers(sig({ id: "b", pair: "ZRO/USDT", tier: "elite" }));
    const elite = h.sent.map((s) => ({ endpoint: s.endpoint, title: s.payload.title, body: s.payload.body }));
    expect(free).toHaveLength(3);
    expect(elite).toEqual(free);
    expect(free[0]).toMatchObject({ title: "⚡ BUY SIGNAL", body: "New signal: LayerZero (ZRO)" });
    expect(h.planLookups).toBe(0); // membership is never consulted
  });
  it("only users with notifications and the signal-feed toggle on receive it (existing behaviour)", async () => {
    h.kv.set("user:free_u:prefs", { enabled: false, tradeFeed: true });
    h.kv.set("user:analyzer_u:prefs", { enabled: true, tradeFeed: false });
    await notifyTradeSubscribers(sig());
    expect(h.sent.map((s) => s.endpoint)).toEqual(["https://fcm.googleapis.com/elite_u"]);
  });
  it("sends nothing but the title and body text of the specification (no trade data anywhere in the push)", async () => {
    await notifyTradeSubscribers(sig({ tier: "elite" }));
    for (const s of h.sent) {
      const raw = JSON.stringify(s.payload);
      for (const secret of ["61,200", "59,800", "63,000", "secret reasoning"]) expect(raw).not.toContain(secret);
    }
  });
  it("prevents duplicates: notifying the same signal twice sends once", async () => {
    await notifyTradeSubscribers(sig());
    expect(h.sent).toHaveLength(3);
    await notifyTradeSubscribers(sig());
    expect(h.sent).toHaveLength(3);
  });
  it("a bot retry of the same signal (same tradeId, new feed id) does not notify again", async () => {
    await notifyTradeSubscribers(sig({ id: "uuid-1", tradeId: "T268" }));
    expect(h.sent).toHaveLength(3);
    await notifyTradeSubscribers(sig({ id: "uuid-2", tradeId: "T268" }));
    expect(h.sent).toHaveLength(3);
    await notifyTradeSubscribers(sig({ id: "uuid-3", tradeId: "T269" }));
    expect(h.sent).toHaveLength(6);
  });
  it("website signals (no tradeId) are guarded by their own id", async () => {
    await notifyTradeSubscribers(sig({ id: "web-1", tier: "elite" }));
    await notifyTradeSubscribers(sig({ id: "web-1", tier: "elite" }));
    expect(h.sent).toHaveLength(3);
  });
  it("a different signal is not suppressed by an earlier one", async () => {
    await notifyTradeSubscribers(sig({ id: "one" }));
    await notifyTradeSubscribers(sig({ id: "two" }));
    expect(h.sent).toHaveLength(6);
  });
  it("the notification still goes out when the coin name cannot be found", async () => {
    h.cmc.mockRejectedValue(new Error("cmc down"));
    await notifyTradeSubscribers(sig({ pair: "ZRO/USDT" }));
    expect(h.sent[0].payload.body).toBe("New signal: ZRO");
  });
});
