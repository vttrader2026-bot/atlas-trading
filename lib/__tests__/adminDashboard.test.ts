// ADMIN-v1: the REAL admin routes, the REAL payment/approval logic and the REAL feed route; only Clerk, Upstash and push are fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Meta = Record<string, unknown>;
const h = vi.hoisted(() => ({
  userId: "owner-1" as string | null,
  users: {} as Record<string, { privateMetadata: Meta }>,
  hashes: {} as Record<string, Record<string, unknown>>,
  lists: {} as Record<string, unknown[]>,
  keys: new Set<string>(),
  failMetadata: false,
}));

vi.mock("@clerk/nextjs/server", () => {
  const view = (id: string) => ({ id, firstName: "T", lastName: id, username: null, createdAt: 1, primaryEmailAddressId: "e", emailAddresses: [{ id: "e", emailAddress: `${id}@x.com` }], privateMetadata: h.users[id].privateMetadata });
  return {
    auth: async () => ({ userId: h.userId }),
    clerkClient: async () => ({
      users: {
        getUser: async (id: string) => { if (!h.users[id]) throw new Error("nf"); return view(id); },
        updateUserMetadata: async (id: string, { privateMetadata }: { privateMetadata: Meta }) => {
          if (h.failMetadata) throw new Error("clerk down");
          for (const [k, v] of Object.entries(privateMetadata)) { if (v === null) delete h.users[id].privateMetadata[k]; else h.users[id].privateMetadata[k] = v; }
          return view(id);
        },
        getUserList: async () => ({ data: Object.keys(h.users).map(view), totalCount: Object.keys(h.users).length }),
      },
    }),
  };
});
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async lrange(k: string) { return structuredClone(h.lists[k] ?? []); }
    async lpush(k: string, v: unknown) { (h.lists[k] ??= []).unshift(structuredClone(v)); return 1; }
    async ltrim(k: string, a: number, b: number) { h.lists[k] = (h.lists[k] ?? []).slice(a, b + 1); return "OK"; }
    async lset(k: string, i: number, v: unknown) { h.lists[k][i] = structuredClone(v); return "OK"; }
    async hget(k: string, f: string) { return structuredClone(h.hashes[k]?.[f] ?? null); }
    async hset(k: string, o: Record<string, unknown>) { h.hashes[k] = { ...(h.hashes[k] ?? {}), ...structuredClone(o) }; return 1; }
    async hdel(k: string, f: string) { if (h.hashes[k] && f in h.hashes[k]) { delete h.hashes[k][f]; return 1; } return 0; }
    async hgetall(k: string) { return structuredClone(h.hashes[k] ?? null); }
    async set(k: string, _v: unknown, o?: { nx?: boolean }) { if (o?.nx && h.keys.has(k)) return null; h.keys.add(k); return "OK"; }
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("@/lib/push", () => ({ notifyTradeSubscribers: vi.fn(), notifyTpSlSubscribers: vi.fn(), notifyTradeClosedSubscribers: vi.fn() }));

import { GET as signalsGET, POST as signalsPOST } from "@/app/api/admin/signals/route";
import { PATCH as signalPATCH, DELETE as signalDELETE } from "@/app/api/admin/signals/[id]/route";
import { POST as publishPOST } from "@/app/api/admin/signals/[id]/publish/route";
import { POST as cancelPOST } from "@/app/api/admin/signals/[id]/cancel/route";
import { GET as membersGET } from "@/app/api/admin/members/route";
import { GET as memberGET, POST as memberPOST } from "@/app/api/admin/members/[id]/route";
import { GET as paymentsGET } from "@/app/api/admin/payments/route";
import { GET as paymentGET, POST as paymentPOST } from "@/app/api/admin/payments/[id]/route";
import { PATCH as legacyPATCH } from "@/app/api/payments/[id]/route";
import { GET as feedGET } from "@/app/api/trade-feed/route";
import AdminLayout from "@/app/admin/layout";
import AdminPaymentsRedirect from "@/app/admin/payments/page";
import { isOwnerId } from "@/lib/adminAuth";
import { effectivePlan, getUserPlan } from "@/lib/plan";
import { DAY_MS, memberState, planEliteApproval, planMemberAction } from "@/lib/membership";
import type { PaymentRequest } from "@/lib/paymentRequests";

const OWNER = "owner-1";
const NOW = Date.now();
const json = (body: unknown, method = "POST", headers: Record<string, string> = {}) => new Request("http://x/api/admin", { method, body: JSON.stringify(body), headers: { host: "x", ...headers } });
const get = (url = "http://x/api/admin") => new Request(url);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const SIG = { tier: "elite", pair: "solusdt", direction: "Long", timeframe: "4H", entryZone: "100 - 110", invalidation: "95", tp1: "120", tp2: "130", tp3: "140", reasoning: "why" };
const feedFor = async (userId: string | null) => { h.userId = userId; const r = await feedGET(get("http://x/api/trade-feed")); return r.json(); };
const pay = (o: Partial<PaymentRequest> = {}): PaymentRequest => ({ id: "p1", userId: "m1", plan: "elite", amount: "15", method: "paypal", proof: "data:image/png;base64,AA", status: "pending", createdAt: 1, updatedAt: 1, ...o });

beforeEach(() => {
  process.env.OWNER_CLERK_USER_ID = OWNER;
  process.env.UPSTASH_REDIS_REST_URL = "https://fake";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake";
  process.env.ADMIN_SECRET = "adm";
  h.userId = OWNER;
  h.users = { m1: { privateMetadata: {} }, free1: { privateMetadata: {} }, [OWNER]: { privateMetadata: {} } };
  h.hashes = {};
  h.lists = {};
  h.keys = new Set();
  h.failMetadata = false;
});

describe("owner gate", () => {
  const calls: Array<[string, () => Promise<Response>]> = [
    ["signals GET", () => signalsGET(get())],
    ["signals POST", () => signalsPOST(json({ ...SIG }))],
    ["signal PATCH", () => signalPATCH(json({ ...SIG }, "PATCH"), ctx("a"))],
    ["signal DELETE", () => signalDELETE(json({ confirm: true }, "DELETE"), ctx("a"))],
    ["publish", () => publishPOST(json({ confirm: true }), ctx("a"))],
    ["cancel", () => cancelPOST(json({ confirm: true }), ctx("a"))],
    ["members GET", () => membersGET(get())],
    ["member GET", () => memberGET(get(), ctx("m1"))],
    ["member POST", () => memberPOST(json({ action: "activate", confirm: true }), ctx("m1"))],
    ["payments GET", () => paymentsGET(get())],
    ["payment GET", () => paymentGET(get(), ctx("p1"))],
    ["payment POST", () => paymentPOST(json({ action: "approve", confirm: true }), ctx("p1"))],
  ];
  it.each(["someone-else", null, ""])("user %j gets 404 from every admin API and nothing changes", async (who) => {
    h.hashes["payments:requests"] = { p1: pay() };
    const before = JSON.stringify({ u: h.users, h: h.hashes, l: h.lists });
    h.userId = who as string | null;
    for (const [name, call] of calls) expect((await call()).status, name).toBe(404);
    expect(JSON.stringify({ u: h.users, h: h.hashes, l: h.lists })).toBe(before);
  });
  it("is locked for everybody (even the owner id) when OWNER_CLERK_USER_ID is unset or blank", async () => {
    for (const v of [undefined, "", "  "]) {
      if (v === undefined) delete process.env.OWNER_CLERK_USER_ID; else process.env.OWNER_CLERK_USER_ID = v;
      for (const [name, call] of calls) expect((await call()).status, name).toBe(404);
      expect(isOwnerId(OWNER)).toBe(false);
      expect(isOwnerId("")).toBe(false);
    }
  });
  it("only the exact id matches (no prefix, case change or whitespace)", () => {
    expect(isOwnerId(OWNER)).toBe(true);
    for (const x of ["owner-", "owner-1 ", "OWNER-1", "owner-11", null, undefined]) expect(isOwnerId(x)).toBe(false);
  });
  it("a write from another site is refused even for the owner; the same site works", async () => {
    expect((await signalsPOST(json(SIG, "POST", { origin: "https://evil.example" }))).status).toBe(403);
    expect((await signalsPOST(json(SIG, "POST", { origin: "http://x" }))).status).toBe(201);
  });
  it("the /admin layout is a 404 for non-owners and renders for the owner; the old payments page redirects", async () => {
    h.userId = "someone-else";
    await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_NOT_FOUND");
    h.userId = null;
    await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_NOT_FOUND");
    h.userId = OWNER;
    await expect(AdminLayout({ children: "ok" })).resolves.toBeTruthy();
    expect(() => AdminPaymentsRedirect()).toThrow("REDIRECT:/admin?tab=payments");
  });
});

describe("signal management", () => {
  const create = async (o: Record<string, unknown> = {}) => (await (await signalsPOST(json({ ...SIG, ...o }))).json()).draft as { id: string };
  it("a draft needs an explicit FREE/ELITE choice and valid levels, and is never in the feed", async () => {
    expect((await signalsPOST(json({ ...SIG, tier: undefined }))).status).toBe(400);
    expect((await signalsPOST(json({ ...SIG, tier: "vip" }))).status).toBe(400);
    for (const bad of [{ entryZone: "" }, { invalidation: "abc" }, { tp1: "" }, { pair: "" }, { direction: "Wait" }, { tp2: "x" }]) expect((await signalsPOST(json({ ...SIG, ...bad }))).status, JSON.stringify(bad)).toBe(400);
    const d = await create();
    expect(h.lists["atlas:trade-feed"]).toBeUndefined();
    expect(h.hashes["atlas:signal-drafts"][d.id]).toMatchObject({ pair: "SOLUSDT", tier: "elite" });
  });
  it("publishing needs confirmation, publishes once, and keeps the chosen tier", async () => {
    const d = await create();
    expect((await publishPOST(json({}), ctx(d.id))).status).toBe(400);
    expect(h.lists["atlas:trade-feed"]).toBeUndefined();
    expect((await publishPOST(json({ confirm: true }), ctx(d.id))).status).toBe(201);
    expect((await publishPOST(json({ confirm: true }), ctx(d.id))).status).toBe(404);
    expect(h.lists["atlas:trade-feed"]).toHaveLength(1);
    expect(h.lists["atlas:trade-feed"][0]).toMatchObject({ id: d.id, tier: "elite", status: "open" });
  });
  it("FREE members never get an ELITE signal's levels; ELITE members and closed signals do (existing feed logic)", async () => {
    const d = await create();
    await publishPOST(json({ confirm: true }), ctx(d.id));
    const free = await feedFor("free1");
    expect(free.trades).toEqual([]);
    expect(free.locked).toHaveLength(1);
    expect(JSON.stringify(free)).not.toMatch(/100 - 110|"invalidation"|"tp1"|"entryZone"/);
    h.users.m1.privateMetadata = { plan: "elite", eliteUntil: NOW + DAY_MS };
    expect((await feedFor("m1")).trades[0]).toMatchObject({ entryZone: "100 - 110", invalidation: "95" });
    h.userId = OWNER;
    expect((await cancelPOST(json({ confirm: true, reason: "r" }), ctx(d.id))).status).toBe(200);
    const after = await feedFor("free1");
    expect(after.trades[0]).toMatchObject({ entryZone: "100 - 110", status: "closed" }); // closed ELITE records are public
  });
  it("a FREE signal is visible to FREE members", async () => {
    const d = await create({ tier: "free" });
    await publishPOST(json({ confirm: true }), ctx(d.id));
    expect((await feedFor("free1")).trades[0]).toMatchObject({ id: d.id, tier: "free", entryZone: "100 - 110", invalidation: "95" });
  });
  it("visibility cannot change after publishing, but can change on a draft", async () => {
    const d = await create();
    expect((await signalPATCH(json({ ...SIG, tier: "free" }, "PATCH"), ctx(d.id))).status).toBe(200);
    expect(h.hashes["atlas:signal-drafts"][d.id]).toMatchObject({ tier: "free" });
    await publishPOST(json({ confirm: true }), ctx(d.id));
    expect((await signalPATCH(json({ ...SIG, tier: "elite" }, "PATCH"), ctx(d.id))).status).toBe(400);
    expect(h.lists["atlas:trade-feed"][0]).toMatchObject({ tier: "free" });
    expect((await signalPATCH(json({ ...SIG, tier: "free", tp1: "125" }, "PATCH"), ctx(d.id))).status).toBe(200);
    expect(h.lists["atlas:trade-feed"][0]).toMatchObject({ tp1: "125", id: d.id, status: "open" });
  });
  it("a signal members already confirmed, or a closed one, cannot be edited", async () => {
    const d = await create();
    await publishPOST(json({ confirm: true }), ctx(d.id));
    h.hashes["atlas:signal-confirmations"] = { [d.id]: 2 };
    expect((await signalPATCH(json({ ...SIG }, "PATCH"), ctx(d.id))).status).toBe(409);
    h.hashes["atlas:signal-confirmations"] = {};
    await cancelPOST(json({ confirm: true }), ctx(d.id));
    expect((await signalPATCH(json({ ...SIG }, "PATCH"), ctx(d.id))).status).toBe(409);
  });
  it("cancel needs confirmation, keeps the original levels, and cannot repeat", async () => {
    const d = await create();
    await publishPOST(json({ confirm: true }), ctx(d.id));
    expect((await cancelPOST(json({}), ctx(d.id))).status).toBe(400);
    expect((await cancelPOST(json({ confirm: true, reason: "  news  " }), ctx(d.id))).status).toBe(200);
    expect(h.lists["atlas:trade-feed"][0]).toMatchObject({ status: "closed", entryZone: "100 - 110", closing: { outcome: "CANCELLED", reason: "news" } });
    expect((await cancelPOST(json({ confirm: true }), ctx(d.id))).status).toBe(409);
  });
  it("only drafts can be deleted, and only with confirmation", async () => {
    const d = await create();
    expect((await signalDELETE(json({}, "DELETE"), ctx(d.id))).status).toBe(400);
    expect((await signalDELETE(json({ confirm: true }, "DELETE"), ctx(d.id))).status).toBe(200);
    const d2 = await create();
    await publishPOST(json({ confirm: true }), ctx(d2.id));
    expect((await signalDELETE(json({ confirm: true }, "DELETE"), ctx(d2.id))).status).toBe(404);
    expect(h.lists["atlas:trade-feed"]).toHaveLength(1);
  });
  it("every write is audited", async () => {
    await create();
    expect(h.lists["atlas:admin-audit"][0]).toMatchObject({ actor: OWNER, action: "signal.draft.create" });
  });
});

describe("membership rules (pure)", () => {
  it("effectivePlan: suspension and expiry remove access; legacy ELITE without a date stays; bad dates fail closed", () => {
    expect(effectivePlan({ plan: "elite" }, NOW)).toBe("elite");
    expect(effectivePlan({ plan: "elite", eliteUntil: NOW + 1 }, NOW)).toBe("elite");
    expect(effectivePlan({ plan: "elite", eliteUntil: NOW }, NOW)).toBe("free");
    expect(effectivePlan({ plan: "elite", eliteUntil: NOW - 1 }, NOW)).toBe("free");
    expect(effectivePlan({ plan: "elite", eliteUntil: "soon" }, NOW)).toBe("free");
    expect(effectivePlan({ plan: "elite", eliteUntil: NaN }, NOW)).toBe("free");
    expect(effectivePlan({ plan: "elite", suspended: true }, NOW)).toBe("free");
    expect(effectivePlan({ plan: "analyzer" }, NOW)).toBe("analyzer");
    expect(effectivePlan({ plan: "analyzer", suspended: true }, NOW)).toBe("free");
    expect(effectivePlan({}, NOW)).toBe("free");
    expect(effectivePlan(null, NOW)).toBe("free");
  });
  it("approval: 30 days from now, extended from the current end while active, from now once expired, never shortens", () => {
    expect(planEliteApproval({}, NOW)).toMatchObject({ kind: "started", until: NOW + 30 * DAY_MS });
    expect(planEliteApproval({ plan: "elite", eliteUntil: NOW + 10 * DAY_MS }, NOW)).toMatchObject({ kind: "extended", until: NOW + 40 * DAY_MS });
    expect(planEliteApproval({ plan: "elite", eliteUntil: NOW - DAY_MS }, NOW)).toMatchObject({ kind: "started", until: NOW + 30 * DAY_MS });
    expect(planEliteApproval({ plan: "elite" }, NOW)).toEqual({ kind: "unlimited", patch: null, until: null });
    expect(planEliteApproval({ plan: "analyzer" }, NOW).patch).toEqual({ plan: "elite", eliteUntil: NOW + 30 * DAY_MS });
  });
  it("actions: the rules", () => {
    const act = (m: Meta, a: Parameters<typeof planMemberAction>[1], i = {}) => planMemberAction(m, a, i, NOW);
    expect(act({}, "activate")).toMatchObject({ ok: true, patch: { plan: "elite", eliteUntil: NOW + 30 * DAY_MS } });
    expect(act({ plan: "elite", eliteUntil: NOW + DAY_MS }, "activate")).toEqual({ ok: false, error: "alreadyActive" });
    expect(act({ plan: "elite" }, "activate")).toEqual({ ok: false, error: "alreadyActive" });
    for (const d of [0, -1, 1.5, 400, "3"]) expect(act({}, "activate", { days: d })).toEqual({ ok: false, error: "badDays" });
    expect(act({ plan: "elite", eliteUntil: NOW + 5 * DAY_MS }, "renew", { days: 30 })).toMatchObject({ ok: true, patch: { eliteUntil: NOW + 35 * DAY_MS } });
    expect(act({ plan: "elite", eliteUntil: NOW - 5 * DAY_MS }, "renew")).toMatchObject({ ok: true, patch: { eliteUntil: NOW + 30 * DAY_MS } });
    expect(act({ plan: "elite" }, "renew")).toEqual({ ok: false, error: "noExpiry" });
    expect(act({}, "renew")).toEqual({ ok: false, error: "notElite" });
    expect(act({ plan: "elite" }, "setExpiry", { until: NOW + DAY_MS })).toMatchObject({ ok: true, patch: { eliteUntil: NOW + DAY_MS } });
    for (const u of [NOW - 1, NaN, "x", NOW + 4000 * DAY_MS]) expect(act({ plan: "elite" }, "setExpiry", { until: u })).toEqual({ ok: false, error: "badDate" });
    expect(act({}, "suspend")).toEqual({ ok: false, error: "nothingToSuspend" });
    expect(act({ plan: "elite", suspended: true }, "suspend")).toEqual({ ok: false, error: "alreadySuspended" });
    expect(act({ plan: "elite" }, "unsuspend")).toEqual({ ok: false, error: "notSuspended" });
    expect(act({}, "revoke")).toEqual({ ok: false, error: "alreadyFree" });
  });
  it("member states for the dashboard", () => {
    expect(memberState({}, NOW)).toBe("free");
    expect(memberState({ plan: "elite" }, NOW)).toBe("unlimited");
    expect(memberState({ plan: "elite", eliteUntil: NOW + 1 }, NOW)).toBe("active");
    expect(memberState({ plan: "elite", eliteUntil: NOW - 1 }, NOW)).toBe("expired");
    expect(memberState({ plan: "elite", suspended: true }, NOW)).toBe("suspended");
  });
});

describe("member management", () => {
  const act = (id: string, body: Record<string, unknown>) => memberPOST(json(body), ctx(id));
  it("every action needs confirmation and a known action name", async () => {
    expect((await act("m1", { action: "activate" })).status).toBe(400);
    expect((await act("m1", { action: "activate", confirm: "yes" })).status).toBe(400);
    expect((await act("m1", { action: "analyzer", confirm: true })).status).toBe(400);
    expect(h.users.m1.privateMetadata).toEqual({});
  });
  it("activate → ELITE 30 days; the member then sees ELITE signals", async () => {
    expect((await act("m1", { action: "activate", confirm: true })).status).toBe(200);
    expect(h.users.m1.privateMetadata.plan).toBe("elite");
    expect(h.users.m1.privateMetadata.eliteUntil as number).toBeGreaterThan(Date.now() + 29 * DAY_MS);
    expect(await getUserPlan("m1")).toBe("elite");
  });
  it("renew extends from the current end while active and from now after expiry", async () => {
    const end = NOW + 10 * DAY_MS;
    h.users.m1.privateMetadata = { plan: "elite", eliteUntil: end };
    await act("m1", { action: "renew", confirm: true });
    expect(h.users.m1.privateMetadata.eliteUntil).toBe(end + 30 * DAY_MS);
    h.users.m1.privateMetadata = { plan: "elite", eliteUntil: NOW - DAY_MS };
    await act("m1", { action: "renew", confirm: true });
    expect(h.users.m1.privateMetadata.eliteUntil as number).toBeGreaterThan(Date.now() + 29 * DAY_MS);
  });
  it("legacy ELITE without an expiry stays active until the owner assigns a date", async () => {
    h.users.m1.privateMetadata = { plan: "elite" };
    expect(await getUserPlan("m1")).toBe("elite");
    expect((await act("m1", { action: "renew", confirm: true })).status).toBe(409);
    expect((await act("m1", { action: "setExpiry", until: NOW + 20 * DAY_MS, confirm: true })).status).toBe(200);
    expect(h.users.m1.privateMetadata.eliteUntil).toBe(NOW + 20 * DAY_MS);
  });
  it("suspend removes ELITE access immediately; unsuspend restores it only while the expiry is valid", async () => {
    h.users.m1.privateMetadata = { plan: "elite", eliteUntil: NOW + 5 * DAY_MS };
    expect(await getUserPlan("m1")).toBe("elite");
    await act("m1", { action: "suspend", confirm: true });
    expect(await getUserPlan("m1")).toBe("free");
    const feed = await feedFor("m1");
    expect(feed.canConfirm).toBeUndefined();
    h.userId = OWNER;
    await act("m1", { action: "unsuspend", confirm: true });
    expect(await getUserPlan("m1")).toBe("elite");
    // expired while suspended: unsuspending does not bring access back
    h.users.m1.privateMetadata = { plan: "elite", eliteUntil: NOW - DAY_MS, suspended: true };
    await act("m1", { action: "unsuspend", confirm: true });
    expect(h.users.m1.privateMetadata.suspended).toBeUndefined();
    expect(await getUserPlan("m1")).toBe("free");
  });
  it("suspended members cannot read ELITE signals", async () => {
    const d = (await (await signalsPOST(json(SIG))).json()).draft;
    await publishPOST(json({ confirm: true }), ctx(d.id));
    h.users.m1.privateMetadata = { plan: "elite", eliteUntil: NOW + DAY_MS, suspended: true };
    const f = await feedFor("m1");
    expect(f.trades).toEqual([]);
    expect(f.locked).toHaveLength(1);
  });
  it("revoke returns the member to FREE", async () => {
    h.users.m1.privateMetadata = { plan: "elite", eliteUntil: NOW + DAY_MS, suspended: true };
    await act("m1", { action: "revoke", confirm: true });
    expect(h.users.m1.privateMetadata).toEqual({});
    expect(await getUserPlan("m1")).toBe("free");
  });
  it("the list and detail show state and expiry, and never include proof screenshots", async () => {
    h.users.m1.privateMetadata = { plan: "elite", eliteUntil: NOW + DAY_MS };
    h.hashes["payments:requests"] = { p1: pay() };
    const list = await (await membersGET(get("http://x/api/admin/members?q="))).json();
    expect(list.members.find((m: { id: string }) => m.id === "m1")).toMatchObject({ state: "active", eliteUntil: NOW + DAY_MS });
    const one = await (await memberGET(get(), ctx("m1"))).json();
    expect(one.payments[0]).toMatchObject({ id: "p1", hasProof: true });
    expect(JSON.stringify(one)).not.toContain("base64");
    expect((await memberGET(get(), ctx("nope"))).status).toBe(404);
  });
});

describe("payment management", () => {
  const decide = (action: string, id = "p1", confirm = true) => paymentPOST(json({ action, confirm }), ctx(id));
  beforeEach(() => { h.hashes["payments:requests"] = { p1: pay() }; });
  it("needs confirmation and a valid action", async () => {
    expect((await decide("approve", "p1", false)).status).toBe(400);
    expect((await decide("maybe")).status).toBe(400);
    expect(h.hashes["payments:requests"].p1).toMatchObject({ status: "pending" });
    expect(h.users.m1.privateMetadata).toEqual({});
  });
  it("approve gives 30 days and records who decided and until when", async () => {
    const res = await decide("approve");
    expect(res.status).toBe(200);
    const until = h.users.m1.privateMetadata.eliteUntil as number;
    expect(until).toBeGreaterThan(Date.now() + 29 * DAY_MS);
    expect(until).toBeLessThan(Date.now() + 31 * DAY_MS);
    expect(h.hashes["payments:requests"].p1).toMatchObject({ status: "approved", reviewedBy: OWNER, grantedUntil: until });
    expect(await getUserPlan("m1")).toBe("elite");
  });
  it("a renewal extends from the current end date while active", async () => {
    const end = Date.now() + 10 * DAY_MS;
    h.users.m1.privateMetadata = { plan: "elite", eliteUntil: end };
    await decide("approve");
    expect(h.users.m1.privateMetadata.eliteUntil).toBe(end + 30 * DAY_MS);
  });
  it("after expiry the new 30 days start at the approval date", async () => {
    h.users.m1.privateMetadata = { plan: "elite", eliteUntil: Date.now() - 20 * DAY_MS };
    await decide("approve");
    expect(h.users.m1.privateMetadata.eliteUntil as number).toBeGreaterThan(Date.now() + 29 * DAY_MS);
  });
  it("an ELITE member with no expiry is never downgraded or given a shorter end date", async () => {
    h.users.m1.privateMetadata = { plan: "elite" };
    const res = await decide("approve");
    expect((await res.json()).kind).toBe("unlimited");
    expect(h.users.m1.privateMetadata).toEqual({ plan: "elite" });
    expect(h.hashes["payments:requests"].p1).toMatchObject({ status: "approved" });
  });
  it("a legacy Analyzer payment never downgrades an ELITE member, and still works for others", async () => {
    h.hashes["payments:requests"] = { p1: pay({ plan: "analyzer" }) };
    h.users.m1.privateMetadata = { plan: "elite", eliteUntil: NOW + DAY_MS };
    await decide("approve");
    expect(h.users.m1.privateMetadata).toEqual({ plan: "elite", eliteUntil: NOW + DAY_MS });
    h.hashes["payments:requests"] = { p2: pay({ id: "p2", userId: "free1", plan: "analyzer" }) };
    await decide("approve", "p2");
    expect(h.users.free1.privateMetadata).toEqual({ plan: "analyzer" });
  });
  it("a request without a plan (created before Analyzer existed) means ELITE", async () => {
    h.hashes["payments:requests"] = { p1: { ...pay(), plan: undefined } };
    await decide("approve");
    expect(h.users.m1.privateMetadata.plan).toBe("elite");
  });
  it("a suspension is not lifted by an approval", async () => {
    h.users.m1.privateMetadata = { plan: "elite", eliteUntil: NOW + DAY_MS, suspended: true };
    await decide("approve");
    expect(h.users.m1.privateMetadata.suspended).toBe(true);
    expect(await getUserPlan("m1")).toBe("free");
  });
  it("a request is decided once: no second approval (no double 30 days), no approve after reject", async () => {
    await decide("approve");
    const once = h.users.m1.privateMetadata.eliteUntil;
    expect((await decide("approve")).status).toBe(409);
    expect((await decide("reject")).status).toBe(409);
    expect(h.users.m1.privateMetadata.eliteUntil).toBe(once);
    h.hashes["payments:requests"] = { p2: pay({ id: "p2", userId: "free1" }) };
    expect((await decide("reject", "p2")).status).toBe(200);
    expect((await decide("approve", "p2")).status).toBe(409);
    expect(h.users.free1.privateMetadata).toEqual({});
  });
  it("two simultaneous approvals only extend once", async () => {
    const [a, b] = await Promise.all([decide("approve"), decide("approve")]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(h.users.m1.privateMetadata.eliteUntil as number).toBeLessThan(Date.now() + 31 * DAY_MS);
  });
  it("if the plan update fails the request stays pending and can be retried", async () => {
    h.failMetadata = true;
    expect((await decide("approve")).status).toBe(500);
    expect(h.hashes["payments:requests"].p1).toMatchObject({ status: "pending" });
    h.failMetadata = false;
    h.keys.clear();
    expect((await decide("approve")).status).toBe(200);
  });
  it("unknown request → 404; the list hides proofs and shows all statuses as history; the proof is fetched per request", async () => {
    expect((await decide("approve", "nope")).status).toBe(404);
    h.hashes["payments:requests"] = { p1: pay(), p2: pay({ id: "p2", status: "approved", createdAt: 2 }) };
    const all = await (await paymentsGET(get("http://x/api/admin/payments"))).json();
    expect(all.requests.map((r: { id: string }) => r.id)).toEqual(["p2", "p1"]);
    expect(JSON.stringify(all)).not.toContain("base64");
    const pending = await (await paymentsGET(get("http://x/api/admin/payments?status=pending"))).json();
    expect(pending.requests).toHaveLength(1);
    expect((await (await paymentGET(get(), ctx("p1"))).json()).request.proof).toContain("base64");
  });
});

describe("legacy ADMIN_SECRET payments route still works (same rules)", () => {
  const patch = (status: string, secret: string | null = "adm") => legacyPATCH(new Request("http://x/api/payments/p1", { method: "PATCH", body: JSON.stringify({ status }), headers: secret ? { "x-admin-secret": secret } : {} }) as never, ctx("p1"));
  beforeEach(() => { h.hashes["payments:requests"] = { p1: pay() }; });
  it("needs the secret", async () => {
    expect((await patch("approved", null)).status).toBe(401);
    expect((await patch("approved", "wrong")).status).toBe(401);
    expect(h.users.m1.privateMetadata).toEqual({});
  });
  it("approves with 30 days, once", async () => {
    expect((await patch("approved")).status).toBe(200);
    expect(h.users.m1.privateMetadata.eliteUntil as number).toBeGreaterThan(Date.now() + 29 * DAY_MS);
    expect((await patch("approved")).status).toBe(409);
    expect(h.hashes["payments:requests"].p1).toMatchObject({ reviewedBy: "admin-secret" });
  });
  it("rejects, and the owner session is not needed or accepted in its place", async () => {
    h.userId = OWNER;
    expect((await patch("rejected")).status).toBe(200);
    expect(h.hashes["payments:requests"].p1).toMatchObject({ status: "rejected" });
  });
});
