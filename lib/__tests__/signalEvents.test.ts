// SIGNAL-EVENTS-v1: result notifications (TP1, TP2, TP3, SL, closed) reach the right audience exactly once.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  users: [] as string[],
  plans: {} as Record<string, string>,
  subs: {} as Record<string, Record<string, unknown>>,
  sent: [] as Array<{ user: string; payload: { title: string; tag?: string } }>,
  failSend: false,
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, json: string) => {
      if (h.failSend) throw Object.assign(new Error("down"), { statusCode: 500 });
      h.sent.push({ user: sub.endpoint.split("/").pop() as string, payload: JSON.parse(json) });
    },
  },
}));
vi.mock("@/lib/userStore", () => ({
  getRedis: () => ({
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => { if (o?.nx && h.kv.has(k)) return null; h.kv.set(k, v); return "OK"; },
    get: async (k: string) => (h.kv.has(k) ? h.kv.get(k) : null),
    del: async (k: string) => (h.kv.delete(k) ? 1 : 0),
    smembers: async () => h.users,
    hgetall: async (k: string) => h.subs[k.split(":")[1]] ?? null,
    hdel: async () => 1,
  }),
}));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: async (u: string) => ({ plan: h.plans[u] ?? "free" }) }));
vi.mock("@/lib/plan", () => ({ getUserPlan: async (u: string) => h.plans[u] ?? "free", analyzeLimitForPlan: () => 2 }));
vi.mock("@/lib/coinmarketcap", () => ({ getCoinNameFromCmc: async () => null }));

import { SIGNAL_EVENTS, notifySignalEvent, signalEventKey } from "@/lib/push";
import type { PublishedTrade } from "@/lib/tradeFeed";

const sig = (over: Partial<PublishedTrade> = {}): PublishedTrade => ({
  id: "sig-1", createdAt: 1, pair: "SOL/USDT", direction: "Long", timeframe: "4H", entryZone: "100 - 102", invalidation: "95",
  tp1: "110", tp2: "120", tp3: "130", reasoning: "r", status: "open", ...over,
});
const subFor = (u: string) => ({ [`dev-${u}`]: { endpoint: `https://fcm.googleapis.com/${u}`, keys: { p256dh: "p", auth: "a" }, lang: "en", createdAt: 1 } });
const who = () => h.sent.map((s) => s.user).sort();

beforeEach(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub"; process.env.VAPID_PRIVATE_KEY = "priv"; process.env.VAPID_SUBJECT = "mailto:a@b.c";
  process.env.OWNER_CLERK_USER_ID = "owner";
  h.kv.clear(); h.sent = []; h.failSend = false;
  h.users = ["free_u", "elite_u", "owner", "off_u"];
  h.plans = { elite_u: "elite" };
  h.subs = Object.fromEntries(h.users.map((u) => [u, subFor(u)]));
  for (const u of ["free_u", "elite_u", "owner"]) h.kv.set(`user:${u}:prefs`, { enabled: true, tradeFeed: true });
  h.kv.set("user:off_u:prefs", { enabled: true, tradeFeed: false });
});

describe("audience", () => {
  it("a FREE signal result goes to everyone with signal notifications on (not to members who switched them off)", async () => {
    for (const ev of ["TP1", "TP2", "TP3", "SL", "CLOSED"] as const) {
      h.sent = []; h.kv.clear();
      for (const u of ["free_u", "elite_u", "owner"]) h.kv.set(`user:${u}:prefs`, { enabled: true, tradeFeed: true });
      h.kv.set("user:off_u:prefs", { enabled: true, tradeFeed: false });
      expect((await notifySignalEvent(sig(), ev)).reason).toBe("sent");
      expect(who()).toEqual(["elite_u", "free_u", "owner"]);
    }
  });
  it("an ELITE signal result goes only to ELITE members and the owner, never to a Free member", async () => {
    for (const ev of SIGNAL_EVENTS) {
      h.sent = []; h.kv.forEach((_v, k) => k.startsWith("push:") && h.kv.delete(k));
      await notifySignalEvent(sig({ tier: "elite" }), ev);
      expect(who()).toEqual(["elite_u", "owner"]);
    }
  });
  it("an expired or Free plan loses ELITE results immediately", async () => {
    h.plans.elite_u = "free";
    await notifySignalEvent(sig({ tier: "elite" }), "SL");
    expect(who()).toEqual(["owner"]);
  });
});

describe("no duplicates, no invented events", () => {
  it("the same signal and event is sent once, however often it is called (retry, double click, two paths)", async () => {
    await notifySignalEvent(sig(), "TP1");
    const n = h.sent.length;
    expect(n).toBe(3);
    expect((await notifySignalEvent(sig(), "TP1")).reason).toBe("duplicate");
    await Promise.all([notifySignalEvent(sig(), "TP1"), notifySignalEvent(sig(), "TP1")]);
    expect(h.sent.length).toBe(n);
  });
  it("different events of one signal, and the same event of another signal, are each sent", async () => {
    await notifySignalEvent(sig(), "TP1");
    await notifySignalEvent(sig(), "TP2");
    await notifySignalEvent(sig({ id: "sig-2" }), "TP1");
    expect(h.sent.length).toBe(9);
    expect(h.kv.has(signalEventKey("sig-1", "TP1"))).toBe(true);
  });
  it("only the five real events exist; a made-up event is not part of the API", () => {
    expect([...SIGNAL_EVENTS]).toEqual(["TP1", "TP2", "TP3", "SL", "CLOSED"]);
  });
  it("if no device could be reached the claim is released so the event can still be delivered later", async () => {
    h.failSend = true;
    expect((await notifySignalEvent(sig(), "SL")).reason).toBe("nobody");
    expect(h.kv.has(signalEventKey("sig-1", "SL"))).toBe(false);
    h.failSend = false;
    expect((await notifySignalEvent(sig(), "SL")).reason).toBe("sent");
    expect(h.sent.length).toBe(3);
  });
  it("nothing is sent when push is not configured", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect((await notifySignalEvent(sig(), "TP1")).reason).toBe("not-configured");
    expect(h.sent.length).toBe(0);
  });
});
