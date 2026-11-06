// Quota enforcement with the REAL lib/plan.ts. Redis and Clerk's plan lookup are replaced by in-memory
// fakes: this proves the logic (limits per plan, atomicity, fail-closed on outage), not Upstash itself.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, number>(),
  redis: null as null | Record<string, unknown>,
  plan: "free" as string,
  failOn: null as null | "get" | "incr" | "expire",
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "u1" }),
  clerkClient: async () => ({ users: { getUser: async () => ({ privateMetadata: { plan: h.plan } }) } }),
}));
vi.mock("@/lib/userStore", () => ({ getRedis: () => h.redis }));

import { analyzeLimitForPlan, consumeAnalyzeUsage, peekAnalyzeUsage } from "@/lib/plan";

const fakeRedis = () => ({
  get: async (k: string) => {
    if (h.failOn === "get") throw new Error("redis down");
    return h.store.get(k) ?? null;
  },
  incr: async (k: string) => {
    if (h.failOn === "incr") throw new Error("redis down");
    h.store.set(k, (h.store.get(k) ?? 0) + 1);
    return h.store.get(k)!;
  },
  decr: async (k: string) => {
    h.store.set(k, (h.store.get(k) ?? 0) - 1);
    return h.store.get(k)!;
  },
  expire: async () => {
    if (h.failOn === "expire") throw new Error("redis down");
    return 1;
  },
});

beforeEach(() => {
  h.store.clear();
  h.plan = "free";
  h.failOn = null;
  h.redis = fakeRedis();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("plan limits", () => {
  it("keeps the intended membership limits", () => {
    expect(analyzeLimitForPlan("free")).toBe(3);
    expect(analyzeLimitForPlan("elite")).toBe(20);
  });

  it("FREE: 3 uses then refused; refused attempts do not push the counter up", async () => {
    for (let i = 3; i >= 1; i--) expect(await consumeAnalyzeUsage("u1")).toMatchObject({ allowed: true, remaining: i - 1, limit: 3, plan: "free" });
    for (let i = 0; i < 5; i++) expect(await consumeAnalyzeUsage("u1")).toMatchObject({ allowed: false, remaining: 0, limit: 3 });
    expect([...h.store.values()]).toEqual([3]);
    expect(await peekAnalyzeUsage("u1")).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("ELITE: 20 uses then refused (unknown or missing plan metadata is FREE)", async () => {
    h.plan = "elite";
    for (let i = 0; i < 20; i++) expect((await consumeAnalyzeUsage("u1")).allowed).toBe(true);
    expect((await consumeAnalyzeUsage("u1")).allowed).toBe(false);
    h.store.clear();
    h.plan = "platinum"; // not a real plan
    expect((await peekAnalyzeUsage("u1")).limit).toBe(3);
    h.plan = "analyzer"; // the retired Analyzer plan: old accounts are simply FREE (3/day), nothing breaks
    expect(await peekAnalyzeUsage("u1")).toMatchObject({ limit: 3, plan: "free", allowed: true });
  });

  it("parallel requests cannot all slip under the limit (atomic increment)", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => consumeAnalyzeUsage("u1")));
    expect(results.filter((r) => r.allowed).length).toBe(3);
  });

  it("peek never spends a use", async () => {
    await peekAnalyzeUsage("u1");
    await peekAnalyzeUsage("u1");
    expect(h.store.size).toBe(0);
  });
});

describe("Redis outage: fails closed, never a free pass", () => {
  it.each(["free", "elite"])("%s: Redis not configured → refused as unavailable", async (plan) => {
    h.plan = plan;
    h.redis = null;
    expect(await consumeAnalyzeUsage("u1")).toMatchObject({ allowed: false, unavailable: true });
    expect(await peekAnalyzeUsage("u1")).toMatchObject({ allowed: false, unavailable: true });
  });

  it.each([["get", "peek"], ["incr", "consume"]] as const)("Redis error on %s → refused (%s)", async (op, which) => {
    h.failOn = op;
    const r = which === "peek" ? await peekAnalyzeUsage("u1") : await consumeAnalyzeUsage("u1");
    expect(r).toMatchObject({ allowed: false, unavailable: true, remaining: 0 });
  });

  it("the plan limit is still reported during an outage so the UI can explain it", async () => {
    h.plan = "elite";
    h.redis = null;
    expect((await peekAnalyzeUsage("u1")).limit).toBe(20);
  });
});
