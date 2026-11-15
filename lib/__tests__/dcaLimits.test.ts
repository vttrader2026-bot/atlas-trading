// PHASE-3C: DCA plan limits through the real /api/me/investor route. Only Redis (a JS twin of the atomic write) and the
// Clerk-backed entitlements are fakes. Completion rules are tested on the pure functions and against planProgress().
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({ user: "u1" as string | null, store: new Map<string, unknown>(), ents: {} as Record<string, { plan: string; status: string }>, evalCalls: 0 }));
vi.mock("@/lib/userStore", () => ({
  requireUser: async () =>
    h.user
      ? {
          userId: h.user,
          redis: {
            get: async (k: string) => { await new Promise((r) => setImmediate(r)); return structuredClone(h.store.get(k) ?? null); },
            eval: async (_s: string, keys: string[], a: string[]) => {
              await new Promise((r) => setImmediate(r));
              h.evalCalls++;
              const rev = Number(h.store.get(keys[1]) ?? (h.store.get(keys[0]) as { revision?: number } | undefined)?.revision ?? 0);
              if (rev !== Number(a[0])) return 0;
              h.store.set(keys[0], JSON.parse(a[1]));
              h.store.set(keys[1], rev + 1);
              return 1;
            },
          },
        }
      : NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: async (id: string) => h.ents[id] ?? { plan: "free", status: "verified" } }));

import { GET, PUT } from "@/app/api/me/investor/route";
import { activePlanCount, isPlanActive, isPlanCompleted, planProgress, planSlotKeys, planState } from "@/lib/investor/dca";
import type { DcaPlan, InvestorDoc, Purchase } from "@/lib/investor/model";
import { LIMIT_ENFORCEMENT, PLAN_LIMITS } from "@/lib/entitlementConfig";
import { dcaLimitsAr, dcaLimitsEn, dcaLimitsFr } from "@/lib/i18nDcaLimits";

let n = 0;
const plan = (o: Partial<DcaPlan> = {}): DcaPlan => ({ id: `p${++n}`, name: "Plan", asset: "ADA", budget: 1000, initial: 100, recurring: { amount: 50, frequency: "monthly", startDate: "2025-01-01", count: 2 }, dips: [{ dropPct: 10, amount: 50 }], refPrice: 1, createdAt: "2025-01-01T00:00:00.000Z", ...o });
const buy = (p: DcaPlan, slot: string): Purchase => ({ id: `b${++n}`, asset: p.asset, date: "2025-01-02", qty: 1, price: 1, fee: 0, planId: p.id, slot });
const allBuys = (p: DcaPlan) => planSlotKeys(p).map((s) => buy(p, s));
const doc = (o: Partial<InvestorDoc> = {}): InvestorDoc => ({ revision: 0, purchases: [], sales: [], cash: [], plans: [], manualPrices: {}, bnbDiscount: false, ...o });
const put = (d: InvestorDoc, base = d.revision) => PUT(new Request("http://x/api/me/investor", { method: "PUT", body: JSON.stringify({ baseRevision: base, doc: d }) }));
const stored = () => h.store.get("user:u1:investor") as InvestorDoc | undefined;
const seed = (d: InvestorDoc) => h.store.set("user:u1:investor", d);

beforeEach(() => { h.user = "u1"; h.store.clear(); h.ents = {}; h.evalCalls = 0; n = 0; });

describe("which plans are active (pure)", () => {
  it("a new plan is active; closing makes it closed; a plan with every slot bought is completed", () => {
    const p = plan();
    expect(planState(p, [])).toBe("active");
    expect(planState({ ...p, closedAt: "2025-02-01T00:00:00.000Z" }, [])).toBe("closed");
    expect(planSlotKeys(p)).toEqual(["initial", "r1", "r2", "d1"]);
    expect(isPlanCompleted(p, allBuys(p).slice(0, 3))).toBe(false);
    expect(isPlanCompleted(p, allBuys(p))).toBe(true);
    expect(planState(p, allBuys(p))).toBe("completed");
  });
  it("a plan with ZERO scheduled slots is never completed", () => {
    const p = plan({ initial: 0, recurring: { amount: 0, frequency: "monthly", startDate: "2025-01-01", count: 0 }, dips: [] });
    expect(planSlotKeys(p)).toEqual([]);
    expect(isPlanCompleted(p, [])).toBe(false);
    expect(isPlanActive(p, [])).toBe(true);
  });
  it("completion matches planProgress() (done = total) and ignores other plans' purchases and slotless purchases", () => {
    const p = plan(), other = plan();
    const buys = [...allBuys(p).slice(0, 3), ...allBuys(other), { ...buy(p, "d1"), slot: undefined } as Purchase];
    const pr = planProgress(p, buys, "2030-01-01", null);
    expect(isPlanCompleted(p, buys)).toBe(pr.doneCount === pr.totalCount);
    expect(isPlanCompleted(p, buys)).toBe(false);
    const all = allBuys(p);
    const pr2 = planProgress(p, all, "2030-01-01", null);
    expect(pr2.doneCount).toBe(pr2.totalCount);
    expect(isPlanCompleted(p, all)).toBe(true);
  });
  it("activePlanCount counts only active plans", () => {
    const a = plan(), b = plan(), c = plan(), d = plan();
    expect(activePlanCount({ plans: [a, b, { ...c, closedAt: "x" }, d], purchases: allBuys(d) })).toBe(2);
  });
});

describe("limits (central config)", () => {
  it("2 for Free, 20 for ELITE, enforcement live", () => {
    expect(PLAN_LIMITS.free.activeDcaPlans).toBe(2);
    expect(PLAN_LIMITS.elite.activeDcaPlans).toBe(20);
    expect(LIMIT_ENFORCEMENT.activeDcaPlans).toBe("live");
  });
  it("Free can create 2 plans and the 3rd is refused with 409 dca_limit; nothing is saved", async () => {
    let d = doc();
    for (let i = 0; i < 2; i++) { d = { ...d, plans: [...d.plans, plan()] }; const r = await put(d); expect(r.status).toBe(200); d = (await r.json()).doc; }
    const refused = await put({ ...d, plans: [...d.plans, plan()] });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "limit", code: "dca_limit", limit: 2, plan: "free", active: 2 });
    expect(stored()!.plans).toHaveLength(2);
    expect(stored()!.revision).toBe(2);
  });
  it("ELITE can have 20 and the 21st is refused", async () => {
    h.ents.u1 = { plan: "elite", status: "verified" };
    seed(doc({ revision: 5, plans: Array.from({ length: 19 }, () => plan()) }));
    expect((await put(doc({ revision: 5, plans: [...stored()!.plans, plan()] }))).status).toBe(200);
    const r = await put(doc({ revision: 6, plans: [...stored()!.plans, plan()] }));
    expect(r.status).toBe(409);
    expect((await r.json()).limit).toBe(20);
  });
  it("completed and closed plans do not use a slot", async () => {
    const done = plan(), closed = plan({ closedAt: "2025-03-01T00:00:00.000Z" }), a = plan();
    seed(doc({ revision: 1, plans: [done, closed, a], purchases: allBuys(done) }));
    expect((await put(doc({ revision: 1, plans: [...stored()!.plans, plan()], purchases: stored()!.purchases }))).status).toBe(200);
    expect((await put(doc({ revision: 2, plans: [...stored()!.plans, plan()], purchases: stored()!.purchases }))).status).toBe(409);
  });
  it("existing documents without any new field keep loading and saving (compatibility)", async () => {
    seed(doc({ revision: 3, plans: [plan()], purchases: [{ id: "x", asset: "ADA", date: "2025-01-01", qty: 1, price: 1, fee: 0 }] }));
    const got = await (await GET()).json();
    expect(got.doc.plans[0].closedAt).toBeUndefined();
    expect(got.dca).toMatchObject({ active: 1, limit: 2, plan: "free" });
    expect((await put({ ...got.doc, bnbDiscount: true })).status).toBe(200);
  });
});

describe("Close and Restore", () => {
  it("closing frees a slot and keeps the plan, its levels and its purchases; Restore needs room", async () => {
    const [a, b] = [plan({ name: "Keep me" }), plan()];
    seed(doc({ revision: 1, plans: [a, b], purchases: [buy(a, "initial")] }));
    let r = await put(doc({ revision: 1, plans: [{ ...a, closedAt: "2025-04-01T00:00:00.000Z" }, b], purchases: stored()!.purchases }));
    expect(r.status).toBe(200);
    expect(stored()!.plans[0]).toMatchObject({ name: "Keep me", initial: 100, refPrice: 1, closedAt: "2025-04-01T00:00:00.000Z" });
    expect(stored()!.purchases).toHaveLength(1);
    // a new plan fits now; then Restore is refused because both slots are used
    r = await put(doc({ revision: 2, plans: [...stored()!.plans, plan()], purchases: stored()!.purchases }));
    expect(r.status).toBe(200);
    const restored = stored()!.plans.map((p) => (p.id === a.id ? { ...p, closedAt: undefined } : p));
    const refused = await put(doc({ revision: 3, plans: restored, purchases: stored()!.purchases }));
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("dca_limit");
    expect(stored()!.plans.find((p) => p.id === a.id)!.closedAt).toBeDefined();
    // close another, then Restore works
    const closeB = stored()!.plans.map((p) => (p.id === b.id ? { ...p, closedAt: "2025-05-01T00:00:00.000Z" } : p));
    expect((await put(doc({ revision: 3, plans: closeB, purchases: stored()!.purchases }))).status).toBe(200);
    expect((await put(doc({ revision: 4, plans: closeB.map((p) => (p.id === a.id ? { ...p, closedAt: undefined } : p)), purchases: stored()!.purchases }))).status).toBe(200);
    expect(stored()!.plans.find((p) => p.id === a.id)!.closedAt).toBeUndefined();
  });
  it("closedAt is validated: a non-string is rejected, a valid one is kept", async () => {
    expect((await put(doc({ plans: [{ ...plan(), closedAt: 5 as never }] }))).status).toBe(400);
    expect((await put(doc({ plans: [{ ...plan(), closedAt: "x".repeat(41) }] }))).status).toBe(400);
    expect((await put(doc({ plans: [{ ...plan(), closedAt: "2025-01-01T00:00:00.000Z" }] }))).status).toBe(200);
  });
  it("deleting a purchase that had completed a plan re-opens it, so it is limited like an add", async () => {
    const done = plan(), a = plan(), b = plan();
    seed(doc({ revision: 1, plans: [done, a, b], purchases: allBuys(done) })); // over: only a and b active = 2 (at the limit)
    const without = stored()!.purchases.slice(1);
    const r = await put(doc({ revision: 1, plans: stored()!.plans, purchases: without }));
    expect(r.status).toBe(409);
    expect(stored()!.purchases).toHaveLength(4);
  });
});

describe("downgrade (over the limit)", () => {
  const over = () => doc({ revision: 1, plans: Array.from({ length: 6 }, () => plan()) });
  it("keeps every plan; can close, delete, buy and edit; cannot add or restore", async () => {
    seed(over());
    const ps = stored()!.plans;
    expect((await put(doc({ revision: 1, plans: [...ps, plan()] }))).status).toBe(409);
    expect((await put(doc({ revision: 1, plans: ps.map((p, i) => (i === 0 ? { ...p, closedAt: "2025-06-01T00:00:00.000Z" } : p)) }))).status).toBe(200);
    expect(stored()!.plans).toHaveLength(6);
    expect((await put(doc({ revision: 2, plans: stored()!.plans.slice(1), purchases: [] }))).status).toBe(200); // delete one
    expect((await put(doc({ revision: 3, plans: stored()!.plans, purchases: [{ id: "z", asset: "ADA", date: "2025-01-01", qty: 1, price: 1, fee: 0 }] }))).status).toBe(200);
    expect((await put(doc({ revision: 4, plans: stored()!.plans.map((p, i) => (i === 0 ? { ...p, name: "Renamed" } : p)), purchases: stored()!.purchases }))).status).toBe(200);
    const restore = stored()!.plans.map((p) => (p.closedAt ? { ...p, closedAt: undefined } : p));
    const closedBefore = stored()!.plans.filter((p) => p.closedAt).length;
    if (closedBefore) expect((await put(doc({ revision: 5, plans: restore, purchases: stored()!.purchases }))).status).toBe(409);
    expect((await (await GET()).json()).dca).toMatchObject({ limit: 2, plan: "free" });
  });
});

describe("unverified membership is never treated as Free", () => {
  beforeEach(() => { h.ents.u1 = { plan: "free", status: "unverified" }; });
  it("creating or restoring a plan gets a retryable 503 and nothing is written", async () => {
    const closed = plan({ closedAt: "2025-01-01T00:00:00.000Z" });
    seed(doc({ revision: 1, plans: [closed] }));
    for (const next of [doc({ revision: 1, plans: [closed, plan()] }), doc({ revision: 1, plans: [{ ...closed, closedAt: undefined }] })]) {
      const r = await put(next);
      expect(r.status).toBe(503);
      expect(r.headers.get("Retry-After")).toBe("30");
      expect(await r.json()).toMatchObject({ code: "membership_unverified", retryable: true });
    }
    expect(stored()!.revision).toBe(1);
    expect(h.evalCalls).toBe(0);
  });
  it("everything that does not add an active plan keeps working, and GET shows the plans without a limit", async () => {
    const a = plan();
    seed(doc({ revision: 1, plans: [a] }));
    expect((await put(doc({ revision: 1, plans: [{ ...a, closedAt: "2025-01-01T00:00:00.000Z" }] }))).status).toBe(200);
    expect((await put(doc({ revision: 2, plans: stored()!.plans, purchases: [{ id: "q", asset: "ADA", date: "2025-01-01", qty: 1, price: 1, fee: 0 }] }))).status).toBe(200);
    const got = await (await GET()).json();
    expect(got.dca.unverified).toBe(true);
    expect(got.dca.limit).toBeUndefined();
    expect(got.doc.plans).toHaveLength(1);
  });
  it("a verified ELITE answer from the cache or the stale grace is used as ELITE", async () => {
    for (const status of ["cached", "stale"]) {
      h.store.clear(); h.ents.u1 = { plan: "elite", status };
      seed(doc({ revision: 1, plans: Array.from({ length: 5 }, () => plan()) }));
      expect((await put(doc({ revision: 1, plans: [...stored()!.plans, plan()] }))).status).toBe(200);
    }
  });
});

describe("concurrency", () => {
  it("20 simultaneous saves from the same revision: exactly one lands, the rest are told they are out of date", async () => {
    const res = await Promise.all(Array.from({ length: 20 }, () => put(doc({ plans: [plan()] }), 0)));
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    expect(res.filter((r) => r.status === 409)).toHaveLength(19);
    expect(stored()!.plans).toHaveLength(1);
    expect(stored()!.revision).toBe(1);
  });
  it("with the limit full, racing creations never exceed it", async () => {
    seed(doc({ revision: 4, plans: [plan()] }));
    const res = await Promise.all(Array.from({ length: 12 }, () => put(doc({ revision: 4, plans: [...stored()!.plans, plan()] }), 4)));
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    expect(stored()!.plans).toHaveLength(2);
    expect(activePlanCount(stored()!)).toBeLessThanOrEqual(2);
  });
});

describe("UI and translations", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  it("the DCA screen offers Close and Restore, the count, the limit explanation and the closed section", () => {
    const s = read("components/investor/Dca.tsx");
    for (const k of ["dcaLimits.close", "dcaLimits.restore", "dcaLimits.activeCount", "dcaLimits.limitReached", "dcaLimits.overLimit", "dcaLimits.sectionClosed", "closedAt"]) expect(s).toContain(k);
    expect(s).not.toMatch(/activeDcaPlans:\s*\d|limit\s*=\s*2\b/);
    const hook = read("components/investor/useInvestor.ts");
    expect(hook).toContain("membership_unverified");
    expect(hook).toContain("dca_limit");
    expect(read("app/investor/page.tsx")).toContain("dcaLimits.unverified");
  });
  it("EN, FR and AR have identical keys and placeholders and are registered in i18n", () => {
    const keys = (d: Record<string, string>) => Object.keys(d).sort();
    expect(keys(dcaLimitsFr)).toEqual(keys(dcaLimitsEn));
    expect(keys(dcaLimitsAr)).toEqual(keys(dcaLimitsEn));
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of keys(dcaLimitsEn)) { expect(ph(dcaLimitsFr[k]), k).toBe(ph(dcaLimitsEn[k])); expect(ph(dcaLimitsAr[k]), k).toBe(ph(dcaLimitsEn[k])); }
    const i18n = read("lib/i18n.tsx");
    for (const L of ["En", "Fr", "Ar"]) expect(i18n).toContain(`dcaLimits: { ...dcaLimits${L} }`);
  });
  it("Trade Plans, Watchlist and the Journal are not imported by the DCA code", () => {
    for (const f of ["lib/investor/atomic.ts", "lib/investor/dca.ts", "app/api/me/investor/route.ts"]) expect(read(f)).not.toMatch(/from ["'][^"']*(tradePlansAtomic|watchlistAtomic|journal)/i);
  });
});
