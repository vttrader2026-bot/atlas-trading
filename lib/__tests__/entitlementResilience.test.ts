// ENTITLEMENTS-v2: how the rest of the app behaves around the verification status: crons, usage counters, one lookup per
// request, and cache invalidation after membership changes. Clerk, Redis and push are in-memory fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

type Meta = Record<string, unknown>;
const h = vi.hoisted(() => ({
  // push + usage store
  kv: new Map<string, unknown>(),
  users: [] as string[],
  sent: [] as string[],
  status: {} as Record<string, { plan: string; status: string }>,
  // clerk
  users2: {} as Record<string, { privateMetadata: Meta }>,
  clerkCalls: 0,
  clerkDown: false,
  failUpdate: false,
  events: [] as string[],
  invalidate: vi.fn(),
  owner: "owner-1",
  audit: vi.fn(),
  requests: {} as Record<string, unknown>,
}));

vi.mock("web-push", () => ({ default: { setVapidDetails: () => {}, sendNotification: async (sub: { endpoint: string }) => { h.sent.push(sub.endpoint.split("/").pop()!); } } }));
vi.mock("@/lib/userStore", () => ({
  getRedis: () => ({
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => { if (o?.nx && h.kv.has(k)) return null; h.kv.set(k, v); return "OK"; },
    get: async (k: string) => (h.kv.has(k) ? h.kv.get(k) : null),
    del: async (k: string) => (h.kv.delete(k) ? 1 : 0),
    incr: async (k: string) => { const n = Number(h.kv.get(k) ?? 0) + 1; h.kv.set(k, n); return n; },
    decr: async (k: string) => { const n = Number(h.kv.get(k) ?? 0) - 1; h.kv.set(k, n); return n; },
    expire: async () => 1,
    smembers: async () => h.users,
    hgetall: async (k: string) => ({ d1: { endpoint: "https://push.example/" + k.split(":")[1], keys: { p256dh: "p", auth: "a" }, lang: "en", createdAt: 1 } }),
    hdel: async () => 1,
  }),
}));
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "u1" }),
  clerkClient: async () => ({
    users: {
      getUser: async (id: string) => { h.clerkCalls++; if (h.clerkDown || !h.users2[id]) throw new Error("clerk"); return { id, privateMetadata: h.users2[id].privateMetadata, createdAt: 1, emailAddresses: [], primaryEmailAddressId: null }; },
      updateUserMetadata: async (id: string, { privateMetadata }: { privateMetadata: Meta }) => {
        if (h.failUpdate) throw new Error("clerk write failed");
        h.events.push("clerk-write");
        h.users2[id].privateMetadata = { ...h.users2[id].privateMetadata, ...privateMetadata };
        return { id, privateMetadata: h.users2[id].privateMetadata, createdAt: 1, emailAddresses: [], primaryEmailAddressId: null };
      },
    },
  }),
}));
vi.mock("@/lib/entitlementCache", async (orig) => ({
  ...(await orig<typeof import("@/lib/entitlementCache")>()),
  invalidateEntitlements: async (id: string) => { h.events.push(`invalidate:${id}`); return h.invalidate(id); },
}));
vi.mock("@/lib/paymentRequests", () => ({
  getPaymentRequest: async (id: string) => h.requests[id] ?? null,
  updatePaymentRequestStatus: async (id: string, status: string) => { h.events.push("mark-" + status); return { ...(h.requests[id] as object), status }; },
  listPaymentRequestsForUser: async () => [],
}));
vi.mock("@/lib/adminAuth", async (orig) => ({
  ...(await orig<typeof import("@/lib/adminAuth")>()),
  requireOwner: async () => ({ userId: h.owner }),
  needsConfirm: () => null,
  readBody: async (req: Request) => req.json(),
  auditLog: async (...a: unknown[]) => { h.audit(...a); },
}));

const entitlementsMock = vi.hoisted(() => ({ real: true }));
vi.mock("@/lib/entitlements", async (orig) => {
  const actual = await orig<typeof import("@/lib/entitlements")>();
  return { ...actual, getEntitlements: async (u: string, n?: number) => (entitlementsMock.real ? actual.getEntitlements(u, n) : (h.status[u] ?? { plan: "free", status: "verified" })) };
});

import { notifyElitePromo, notifyFreeUsersAnalyzerReset } from "@/lib/push";
import { consumeAnalyzeUsage, peekAnalyzeUsage } from "@/lib/plan";
import { getEntitlements } from "@/lib/entitlements";
import { approvePayment, rejectPayment } from "@/lib/paymentApproval";
import { POST as memberPOST } from "@/app/api/admin/members/[id]/route";

const DAY = 86_400_000;
beforeEach(() => {
  h.kv.clear(); h.users = []; h.sent.length = 0; h.status = {}; h.users2 = { m1: { privateMetadata: { plan: "elite", eliteUntil: Date.now() + 10 * DAY } } };
  h.clerkCalls = 0; h.clerkDown = false; h.failUpdate = false; h.events.length = 0; h.invalidate.mockReset().mockResolvedValue(true); h.audit.mockReset();
  h.requests = { r1: { id: "r1", userId: "m1", plan: "elite", status: "pending", amount: "14.99" } };
  entitlementsMock.real = true;
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub"; process.env.VAPID_PRIVATE_KEY = "priv"; process.env.VAPID_SUBJECT = "mailto:a@b.c";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("cron notifications skip members whose plan could not be verified", () => {
  const setup = () => {
    entitlementsMock.real = false;
    h.users = ["free1", "elite1", "stale1", "unk1"];
    h.status = {
      free1: { plan: "free", status: "verified" }, elite1: { plan: "elite", status: "verified" },
      stale1: { plan: "elite", status: "stale" }, unk1: { plan: "free", status: "unverified" },
    };
    for (const u of h.users) h.kv.set(`user:${u}:prefs`, { enabled: true, analyzerReset: true, promotional: true });
  };
  it("analyzer reminders go to confirmed Free members only", async () => {
    setup();
    expect(await notifyFreeUsersAnalyzerReset()).toEqual({ sent: 1, reason: "ok" });
    expect(h.sent).toEqual(["free1"]);
  });
  it("Elite promos skip ELITE, stale-ELITE and unverified members", async () => {
    setup();
    expect(await notifyElitePromo()).toEqual({ sent: 1, reason: "ok" });
    expect(h.sent).toEqual(["free1"]);
  });
  it("during a full outage nobody is messaged as if Free", async () => {
    entitlementsMock.real = true;
    h.clerkDown = true;
    h.users = ["a", "b"];
    for (const u of h.users) h.kv.set(`user:${u}:prefs`, { enabled: true, analyzerReset: true, promotional: true });
    expect((await notifyFreeUsersAnalyzerReset()).sent).toBe(0);
    expect((await notifyElitePromo()).sent).toBe(0);
    expect(h.sent).toEqual([]);
  });
});

describe("usage counters and the membership snapshot", () => {
  it("an unverified snapshot never touches the counter (peek or consume)", async () => {
    const snap = { plan: "free" as const, status: "unverified" as const };
    expect(await peekAnalyzeUsage("u1", snap)).toMatchObject({ allowed: false, unavailable: true });
    expect(await consumeAnalyzeUsage("u1", snap)).toMatchObject({ allowed: false, unavailable: true });
    expect([...h.kv.keys()].filter((k) => k.startsWith("usage:"))).toEqual([]);
  });
  it("calling without a snapshot on an unverified member behaves the same (e.g. /api/me/plan)", async () => {
    h.clerkDown = true;
    expect(await peekAnalyzeUsage("u1")).toMatchObject({ unavailable: true });
    expect(await consumeAnalyzeUsage("u1")).toMatchObject({ unavailable: true });
  });
  it("one membership resolution serves peek and consume: a single Clerk lookup, the right limits, counter behaviour unchanged", async () => {
    h.users2.u1 = { privateMetadata: { plan: "elite" } };
    const snap = await getEntitlements("u1");
    expect(h.clerkCalls).toBe(1);
    const peeked = await peekAnalyzeUsage("u1", snap);
    const consumed = await consumeAnalyzeUsage("u1", snap);
    expect(h.clerkCalls).toBe(1);
    expect(peeked).toMatchObject({ allowed: true, plan: "elite", limit: 20, remaining: 20 });
    expect(consumed).toMatchObject({ allowed: true, plan: "elite", limit: 20, remaining: 19 });
  });
  it("FREE: 3 successful analyses, the 4th is refused and the counter does not climb", async () => {
    h.users2.u1 = { privateMetadata: {} };
    const snap = await getEntitlements("u1");
    const r = [await consumeAnalyzeUsage("u1", snap), await consumeAnalyzeUsage("u1", snap), await consumeAnalyzeUsage("u1", snap), await consumeAnalyzeUsage("u1", snap)];
    expect(r.map((x) => x.allowed)).toEqual([true, true, true, false]);
    expect([...h.kv.entries()].find(([k]) => k.startsWith("usage:"))![1]).toBe(3);
  });
  it("a stale (grace) ELITE snapshot gets the ELITE limit", async () => {
    expect(await consumeAnalyzeUsage("u1", { plan: "elite", status: "stale" })).toMatchObject({ allowed: true, limit: 20, plan: "elite" });
  });
});

describe("cache invalidation after membership changes", () => {
  it("payment approval: invalidates AFTER the Clerk write, before nothing else can see stale state", async () => {
    const r = await approvePayment("r1", "owner");
    expect(r.ok).toBe(true);
    expect(h.events.slice(0, 2)).toEqual(["clerk-write", "invalidate:m1"]);
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });
  it("payment approval: a failed Clerk write invalidates nothing and the request stays pending", async () => {
    h.failUpdate = true;
    const r = await approvePayment("r1", "owner");
    expect(r.ok).toBe(false);
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.events).not.toContain("mark-approved");
  });
  it("payment approval: a failed invalidation does not fail or undo the approval (it is logged; the record expires on its own)", async () => {
    h.invalidate.mockResolvedValue(false);
    const r = await approvePayment("r1", "owner");
    expect(r.ok).toBe(true);
    expect(h.events).toContain("mark-approved");
  });
  it("rejecting a payment changes no membership, so nothing is invalidated", async () => {
    await rejectPayment("r1", "owner");
    expect(h.invalidate).not.toHaveBeenCalled();
  });
  const act = (action: string, extra: Record<string, unknown> = {}) =>
    memberPOST(new Request("http://x/api/admin/members/m1", { method: "POST", body: JSON.stringify({ action, confirm: true, ...extra }) }), { params: Promise.resolve({ id: "m1" }) });
  it("admin renew / suspend / unsuspend / revoke / set-expiry / activate each invalidate after the Clerk write", async () => {
    const steps: [string, Record<string, unknown>][] = [["renew", { days: 30 }], ["suspend", {}], ["unsuspend", {}], ["setExpiry", { until: Date.now() + 5 * DAY }], ["revoke", {}], ["activate", { days: 30 }]];
    for (const [action, extra] of steps) {
      h.events.length = 0; h.invalidate.mockClear();
      const res = await act(action, extra);
      expect(res.status, action).toBe(200);
      expect(h.events, action).toEqual(["clerk-write", "invalidate:m1"]);
      expect(h.invalidate, action).toHaveBeenCalledTimes(1);
    }
  });
  it("an admin action that Clerk rejects, or the rules refuse, invalidates nothing", async () => {
    h.failUpdate = true;
    expect((await act("suspend")).status).toBe(500);
    expect(h.invalidate).not.toHaveBeenCalled();
    h.failUpdate = false;
    const refused = await act("nonsense");
    expect(refused.status).toBe(400);
    expect(h.invalidate).not.toHaveBeenCalled();
  });
  it("a failed invalidation is recorded in the audit entry and the action still succeeds", async () => {
    h.invalidate.mockResolvedValue(false);
    const res = await act("suspend");
    expect(res.status).toBe(200);
    expect(JSON.stringify(h.audit.mock.calls)).toContain("not-cleared");
  });
  it("only these two code paths write membership metadata, and both invalidate", () => {
    for (const f of ["lib/paymentApproval.ts", "app/api/admin/members/[id]/route.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("invalidateEntitlements");
      expect(src.indexOf("updateUserMetadata"), f).toBeLessThan(src.indexOf("invalidateEntitlements("));
    }
  });
});
