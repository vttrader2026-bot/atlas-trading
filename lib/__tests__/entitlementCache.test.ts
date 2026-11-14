// ENTITLEMENTS-v2: the verification cache and the service that uses it. Clerk and Redis are in-memory fakes; the fake
// Redis runs a JavaScript twin of the two Lua scripts (the real Lua is verified separately against a real Redis).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  redisDown: false,
  failEval: 0,
  hasRedis: true,
  clerk: undefined as unknown,
  clerkDown: false,
  clerkCalls: 0,
}));

vi.mock("@/lib/redis", async () => {
  const cache = await vi.importActual<typeof import("@/lib/entitlementCache")>("@/lib/entitlementCache");
  const cjson = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
  const redis = {
    get: async (k: string) => { if (h.redisDown) throw new Error("redis down"); return h.store.get(k) ?? null; },
    // JS twin of WRITE_SCRIPT / INVALIDATE_SCRIPT, dispatched by script identity (atomic: no awaits inside).
    eval: async (script: string, keys: string[], args: string[]) => {
      if (h.redisDown) throw new Error("redis down");
      if (h.failEval > 0) { h.failEval--; throw new Error("eval failed"); }
      if (script === cache.WRITE_SCRIPT) {
        const inv = h.store.get(keys[1]);
        if (inv !== undefined && Number(args[1]) <= Number(inv) + Number(args[3])) return 0;
        const cur = h.store.get(keys[0]);
        if (cur !== undefined) { const r = cjson(cur) as { verifiedAt?: number }; if (Number(r.verifiedAt) > Number(args[1])) return 0; }
        h.store.set(keys[0], JSON.parse(args[0]));
        return 1;
      }
      if (script === cache.INVALIDATE_SCRIPT) {
        const inv = h.store.get(keys[1]);
        if (!(inv !== undefined && Number(inv) >= Number(args[0]))) h.store.set(keys[1], Number(args[0]));
        h.store.delete(keys[0]);
        return 1;
      }
      throw new Error("unexpected script");
    },
  };
  return { getRedis: () => (h.hasRedis ? redis : null) };
});
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "u1" }),
  clerkClient: async () => ({ users: { getUser: async () => { h.clerkCalls++; if (h.clerkDown) throw new Error("clerk down"); return { privateMetadata: h.clerk }; } } }),
}));

import { ENTITLEMENT_FRESH_MS, ENTITLEMENT_STALE_GRACE_MS } from "@/lib/entitlementConfig";
import { entitlementKey, invalidationKey, invalidateEntitlements, parseRecord, readEntitlementRecord, writeVerifiedEntitlement, CLOCK_SKEW_MS } from "@/lib/entitlementCache";
import { membershipFromRecord, recordFromMembership, resolveMembership, type VerifiedRecord } from "@/lib/entitlementRules";
import { getEntitlements } from "@/lib/entitlements";

const T0 = Date.UTC(2026, 10, 14, 12);
const SEC = 1000, HOUR = 3_600_000;
const elite = (verifiedAt: number, o: Partial<VerifiedRecord> = {}): VerifiedRecord => ({ v: 1, plan: "elite", eliteUntil: T0 + 30 * 24 * HOUR, suspended: false, verifiedAt, ...o });
const free = (verifiedAt: number): VerifiedRecord => ({ v: 1, plan: "free", eliteUntil: null, suspended: false, verifiedAt });
const put = (r: unknown) => h.store.set(entitlementKey("u1"), r);

beforeEach(() => {
  h.store.clear(); h.redisDown = false; h.failEval = 0; h.hasRedis = true; h.clerk = { plan: "elite", eliteUntil: T0 + 30 * 24 * HOUR }; h.clerkDown = false; h.clerkCalls = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("schema validation", () => {
  it("accepts exactly the five stored fields (object or JSON string)", () => {
    expect(parseRecord(elite(5))).toEqual(elite(5));
    expect(parseRecord(JSON.stringify(free(5)))).toEqual(free(5));
    expect(parseRecord({ ...elite(5), eliteUntil: null })).toMatchObject({ eliteUntil: null });
  });
  it("rejects anything else", () => {
    const bad: unknown[] = [null, undefined, "x", 7, [], {}, "{bad json", { ...elite(5), v: 2 }, { ...elite(5), plan: "premium" }, { ...elite(5), plan: "ELITE" },
      { ...elite(5), suspended: "true" }, { ...elite(5), eliteUntil: "2099" }, { ...elite(5), eliteUntil: NaN }, { ...elite(5), verifiedAt: "1" },
      { ...elite(5), verifiedAt: 0 }, { ...elite(5), verifiedAt: -1 }, { ...elite(5), verifiedAt: Infinity }, { ...elite(5), extra: 1 }, { plan: "elite" }];
    for (const b of bad) expect(parseRecord(b), JSON.stringify(b)).toBeNull();
  });
  it("an invalid record in Redis is ignored and Clerk is asked instead", async () => {
    put({ v: 1, plan: "elite", suspended: false, eliteUntil: "never", verifiedAt: T0 });
    const e = await getEntitlements("u1", T0 + 5 * SEC);
    expect(e.status).toBe("verified");
    expect(h.clerkCalls).toBe(1);
  });
  it("an invalid record never grants stale ELITE when Clerk is down", async () => {
    put({ v: 1, plan: "elite", suspended: false, eliteUntil: null, verifiedAt: "yesterday" });
    h.clerkDown = true;
    expect((await getEntitlements("u1", T0)).status).toBe("unverified");
  });
});

describe("fresh cache (60 s)", () => {
  it("is used without asking Clerk, and the plan is recomputed from it", async () => {
    put(elite(T0 - 30 * SEC));
    const e = await getEntitlements("u1", T0);
    expect(e).toMatchObject({ plan: "elite", status: "cached" });
    expect(h.clerkCalls).toBe(0);
  });
  it("the window is exactly 60 s", async () => {
    put(elite(T0 - ENTITLEMENT_FRESH_MS));
    expect((await getEntitlements("u1", T0)).status).toBe("cached");
    put(elite(T0 - ENTITLEMENT_FRESH_MS - 1));
    expect((await getEntitlements("u1", T0)).status).toBe("verified");
    expect(h.clerkCalls).toBe(1);
  });
  it("a fresh Free record serves Free and does not ask Clerk", async () => {
    put(free(T0 - 10 * SEC));
    expect(await getEntitlements("u1", T0)).toMatchObject({ plan: "free", status: "cached" });
    expect(h.clerkCalls).toBe(0);
  });
  it("a fresh record whose ELITE end passed is Free (expiry is recomputed with the current time)", async () => {
    put(elite(T0 - 10 * SEC, { eliteUntil: T0 - 1 }));
    expect(await getEntitlements("u1", T0)).toMatchObject({ plan: "free", status: "cached" });
  });
  it("a fresh suspended record is Free", async () => {
    put(elite(T0 - 10 * SEC, { suspended: true }));
    expect(await getEntitlements("u1", T0)).toMatchObject({ plan: "free", status: "cached" });
  });
  it("a future-dated record is not trusted", async () => {
    put(elite(T0 + HOUR));
    expect((await getEntitlements("u1", T0)).status).toBe("verified");
  });
});

describe("Clerk verification populates the cache", () => {
  it("stores only the five fields, from the Clerk values", async () => {
    const e = await getEntitlements("u1", T0);
    expect(e).toMatchObject({ plan: "elite", status: "verified", source: "clerk" });
    expect(h.store.get(entitlementKey("u1"))).toEqual({ v: 1, plan: "elite", eliteUntil: T0 + 30 * 24 * HOUR, suspended: false, verifiedAt: T0 });
    expect(Object.keys(h.store.get(entitlementKey("u1")) as object).sort()).toEqual(["eliteUntil", "plan", "suspended", "v", "verifiedAt"]);
  });
  it("a Clerk failure writes nothing", async () => {
    h.clerkDown = true;
    await getEntitlements("u1", T0);
    expect(h.store.size).toBe(0);
  });
  it("legacy ELITE (no end date) is cached with a null end date", async () => {
    h.clerk = { plan: "elite" };
    await getEntitlements("u1", T0);
    expect(h.store.get(entitlementKey("u1"))).toMatchObject({ plan: "elite", eliteUntil: null });
  });
  it("a malformed eliteUntil is cached as FREE, never as an unlimited ELITE record", async () => {
    h.clerk = { plan: "elite", eliteUntil: "soon" };
    expect(await getEntitlements("u1", T0)).toMatchObject({ plan: "free", status: "verified" });
    expect(h.store.get(entitlementKey("u1"))).toMatchObject({ plan: "free", eliteUntil: null });
    h.clerkDown = true;
    expect((await getEntitlements("u1", T0 + 2 * HOUR)).status).toBe("unverified");
  });
  it("a Redis failure never breaks a verified answer", async () => {
    h.redisDown = true;
    expect(await getEntitlements("u1", T0)).toMatchObject({ plan: "elite", status: "verified" });
  });
  it("no Redis configured: Clerk answers, nothing is cached", async () => {
    h.hasRedis = false;
    expect(await getEntitlements("u1", T0)).toMatchObject({ plan: "elite", status: "verified" });
    expect(h.store.size).toBe(0);
  });
  it("a refreshed lookup replaces the old record", async () => {
    put(elite(T0 - 5 * 60 * SEC, { plan: "free", eliteUntil: null }));
    h.clerk = { plan: "elite" };
    expect(await getEntitlements("u1", T0)).toMatchObject({ plan: "elite", status: "verified" });
    expect(h.store.get(entitlementKey("u1"))).toMatchObject({ plan: "elite", verifiedAt: T0 });
  });
});

describe("Clerk outage: stale ELITE grace (24 h)", () => {
  beforeEach(() => { h.clerkDown = true; });
  it("keeps a verified ELITE member on ELITE", async () => {
    put(elite(T0 - 2 * HOUR));
    expect(await getEntitlements("u1", T0)).toMatchObject({ plan: "elite", status: "stale", source: "cache" });
  });
  it("legacy ELITE without an end date is kept too", async () => {
    put(elite(T0 - 2 * HOUR, { eliteUntil: null }));
    expect((await getEntitlements("u1", T0)).plan).toBe("elite");
  });
  it("the grace is exactly 24 h", async () => {
    put(elite(T0 - ENTITLEMENT_STALE_GRACE_MS));
    expect((await getEntitlements("u1", T0)).status).toBe("stale");
    put(elite(T0 - ENTITLEMENT_STALE_GRACE_MS - 1));
    expect(await getEntitlements("u1", T0)).toMatchObject({ plan: "free", status: "unverified" });
  });
  it("the subscription end still applies during the grace window", async () => {
    put(elite(T0 - 2 * HOUR, { eliteUntil: T0 + 1 * HOUR }));
    expect((await getEntitlements("u1", T0)).status).toBe("stale");
    expect(await getEntitlements("u1", T0 + 1 * HOUR)).toMatchObject({ plan: "free", status: "unverified" });
  });
  it("an already-expired snapshot is not kept alive", async () => {
    put(elite(T0 - 2 * HOUR, { eliteUntil: T0 - 1 }));
    expect((await getEntitlements("u1", T0)).status).toBe("unverified");
  });
  it("a suspended snapshot is not turned into ELITE", async () => {
    put(elite(T0 - 2 * HOUR, { suspended: true }));
    expect(await getEntitlements("u1", T0)).toMatchObject({ plan: "free", status: "unverified" });
  });
  it("a cached FREE record never becomes ELITE", async () => {
    put(free(T0 - 2 * HOUR));
    const e = await getEntitlements("u1", T0);
    expect(e.plan).toBe("free");
    expect(e.status).toBe("unverified");
    put(free(T0 - 10 * SEC));
    expect((await getEntitlements("u1", T0)).plan).toBe("free");
  });
  it("a future-dated record is not served", async () => {
    put(elite(T0 + HOUR));
    expect((await getEntitlements("u1", T0)).status).toBe("unverified");
  });
});

describe("Clerk and Redis both unavailable", () => {
  it("is 'unverified' (unknown), not confirmed Free", async () => {
    h.clerkDown = true; h.redisDown = true;
    const e = await getEntitlements("u1", T0);
    expect(e).toMatchObject({ status: "unverified", source: "fallback" });
    expect(e.status).not.toBe("anonymous");
  });
  it("same with no Redis configured", async () => {
    h.clerkDown = true; h.hasRedis = false;
    expect((await getEntitlements("u1", T0)).status).toBe("unverified");
  });
  it("an anonymous visitor is confirmed Free without touching Clerk or Redis", async () => {
    h.redisDown = true;
    for (const id of [null, undefined, ""]) expect(await getEntitlements(id, T0)).toMatchObject({ plan: "free", status: "anonymous" });
    expect(h.clerkCalls).toBe(0);
  });
});

describe("pure cache rules", () => {
  it("membershipFromRecord only grants stale access to a still-ELITE record", () => {
    expect(membershipFromRecord(elite(T0 - HOUR), T0, "stale")?.status).toBe("stale");
    expect(membershipFromRecord(free(T0 - HOUR), T0, "stale")).toBeNull();
    expect(membershipFromRecord(free(T0 - HOUR), T0, "fresh")).toBeNull();
    expect(membershipFromRecord(free(T0 - SEC), T0, "fresh")?.membership.plan).toBe("free");
  });
  it("recordFromMembership keeps the stored plan and never invents an end date", () => {
    expect(recordFromMembership(resolveMembership({ plan: "elite", eliteUntil: T0 + HOUR }, T0), T0)).toEqual({ v: 1, plan: "elite", eliteUntil: T0 + HOUR, suspended: false, verifiedAt: T0 });
    expect(recordFromMembership(resolveMembership({ plan: "elite", suspended: true }, T0), T0)).toMatchObject({ plan: "elite", suspended: true });
    expect(recordFromMembership(resolveMembership({ plan: "elite", eliteUntil: "x" }, T0), T0).plan).toBe("free");
  });
});

describe("concurrent writes and invalidations", () => {
  it("an older verification never overwrites a newer one, in either order", async () => {
    const older = elite(T0, { plan: "free", eliteUntil: null }), newer = elite(T0 + 5 * SEC);
    expect(await writeVerifiedEntitlement("u1", newer)).toBe(true);
    expect(await writeVerifiedEntitlement("u1", older)).toBe(false);
    expect(await readEntitlementRecord("u1")).toEqual(newer);
    h.store.clear();
    await Promise.all([writeVerifiedEntitlement("u1", older), writeVerifiedEntitlement("u1", newer)]);
    expect(await readEntitlementRecord("u1")).toEqual(newer);
    h.store.clear();
    await Promise.all([writeVerifiedEntitlement("u1", newer), writeVerifiedEntitlement("u1", older)]);
    expect(await readEntitlementRecord("u1")).toEqual(newer);
  });
  it("many parallel writes end with the newest record", async () => {
    const recs = Array.from({ length: 20 }, (_, i) => elite(T0 + i * SEC, { eliteUntil: T0 + i }));
    await Promise.all([...recs].sort(() => Math.random() - 0.5).map((r) => writeVerifiedEntitlement("u1", r)));
    expect((await readEntitlementRecord("u1"))?.verifiedAt).toBe(T0 + 19 * SEC);
  });
  it("invalidation removes the record", async () => {
    put(elite(T0));
    expect(await invalidateEntitlements("u1")).toBe(true);
    expect(await readEntitlementRecord("u1")).toBeNull();
    expect(h.store.has(invalidationKey("u1"))).toBe(true);
  });
  it("a lookup that STARTED before an invalidation cannot repopulate the cache afterwards", async () => {
    const started = Date.now() - 2 * SEC; // read began 2 s ago (e.g. a slow Clerk call), returning the OLD membership
    await invalidateEntitlements("u1");
    expect(await writeVerifiedEntitlement("u1", elite(started))).toBe(false);
    expect(await readEntitlementRecord("u1")).toBeNull();
  });
  it("a lookup that started after the invalidation (and the skew margin) is cached normally", async () => {
    await invalidateEntitlements("u1");
    const later = Date.now() + CLOCK_SKEW_MS + 1000;
    expect(await writeVerifiedEntitlement("u1", elite(later))).toBe(true);
    expect((await readEntitlementRecord("u1"))?.verifiedAt).toBe(later);
  });
  it("a write racing an invalidation never leaves a stale record behind", async () => {
    const started = Date.now() - 100;
    await Promise.all([writeVerifiedEntitlement("u1", elite(started)), invalidateEntitlements("u1")]);
    // either order: write-then-delete leaves nothing; delete-then-write is refused by the tombstone
    expect(await readEntitlementRecord("u1")).toBeNull();
  });
  it("the invalidation tombstone never moves backwards", async () => {
    h.store.set(invalidationKey("u1"), Date.now() + 60_000);
    await invalidateEntitlements("u1");
    expect(Number(h.store.get(invalidationKey("u1")))).toBeGreaterThan(Date.now() + 50_000);
  });
  it("a failed invalidation is retried once, then reported (false) without throwing", async () => {
    put(elite(T0));
    h.failEval = 1;
    expect(await invalidateEntitlements("u1")).toBe(true);
    put(elite(T0));
    h.failEval = 2;
    expect(await invalidateEntitlements("u1")).toBe(false);
    expect(h.store.has(entitlementKey("u1"))).toBe(true); // not cleared: bounded by the 60 s / 24 h rules, and logged
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("NOT CLEARED"));
  });
  it("Redis down or missing: invalidation reports false, never throws", async () => {
    h.redisDown = true;
    expect(await invalidateEntitlements("u1")).toBe(false);
    h.redisDown = false; h.hasRedis = false;
    expect(await invalidateEntitlements("u1")).toBe(false);
    expect(await invalidateEntitlements("")).toBe(false);
  });
  it("after an invalidation the next lookup reads Clerk and sees the new plan", async () => {
    await getEntitlements("u1", T0);
    h.clerk = { plan: "free" };
    expect((await getEntitlements("u1", T0 + 10 * SEC)).plan).toBe("elite"); // still the fresh cached ELITE
    await invalidateEntitlements("u1");
    expect(await getEntitlements("u1", T0 + 20 * SEC + CLOCK_SKEW_MS)).toMatchObject({ plan: "free", status: "verified" });
  });
});

describe("the cache is server-only", () => {
  it("nothing from the request can reach the cache or the service", () => {
    for (const f of ["lib/entitlementCache.ts", "lib/entitlements.ts", "lib/entitlementRules.ts"]) {
      const src = readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(src, f).not.toMatch(/headers\(|cookies\(|request\.|req\.|searchParams|localStorage|body\b/);
    }
  });
});
