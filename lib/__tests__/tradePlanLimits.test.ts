// PHASE-3B: Trade Plan limits through the real route and the real addPlan/setPlanStatus. Only Redis and the Clerk-backed
// entitlements are fakes; the fake Redis eval() is a JS twin of the two Lua scripts (the real Lua runs in tradePlanLua.test.ts).
import { i18nSource } from "./helpers/i18nSource";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  hashes: new Map<string, Map<string, string>>(),
  user: "u1" as string | null,
  ents: {} as Record<string, { plan: string; status: string }>,
}));

const fp = (d: Record<string, unknown>) => ["pair", "direction", "timeframe", "entryZone", "invalidationText", "entry", "invalidation", "tp1", "tp2", "tp3", "signalId"].map((k) => String(d[k] ?? "")).join("|");
const act = (d: { status?: unknown }) => d.status !== "entered" && d.status !== "archived";
const redis = {
  hgetall: async (k: string) => { const m = h.hashes.get(k); if (!m || m.size === 0) return null; return Object.fromEntries([...m].map(([f, v]) => [f, JSON.parse(v)])); },
  hget: async (k: string, f: string) => { const v = h.hashes.get(k)?.get(f); return v === undefined ? null : JSON.parse(v); },
  hset: async (k: string, o: Record<string, unknown>) => { const m = h.hashes.get(k) ?? new Map(); for (const [f, v] of Object.entries(o)) m.set(f, JSON.stringify(v)); h.hashes.set(k, m); return 1; },
  hdel: async (k: string, f: string) => (h.hashes.get(k)?.delete(f) ? 1 : 0),
  eval: async (script: string, keys: string[], a: string[]) => {
    await new Promise((r) => setImmediate(r));
    const m = h.hashes.get(keys[0]) ?? new Map<string, string>();
    if (script.includes("HGETALL")) {
      const newActive = a[4] === "1"; let active = 0; let dup: string | null = null;
      for (const [id, raw] of m) { const d = JSON.parse(raw); if (act(d)) { active++; if (newActive && !dup && fp(d) === a[5]) dup = id; } }
      if (dup) return `dup:${dup}`;
      if (m.size >= Number(a[3])) return "-2";
      if (newActive && active >= Number(a[2])) return "-1";
      m.set(a[0], a[1]); h.hashes.set(keys[0], m); return "1";
    }
    const raw = m.get(a[0]); if (raw === undefined) return "0";
    if (a[2] === "1" && !act(JSON.parse(raw))) { const active = [...m.values()].filter((v) => act(JSON.parse(v))).length; if (active >= Number(a[3])) return "-1"; }
    m.set(a[0], a[1]); return "1";
  },
};
vi.mock("@/lib/userStore", () => ({
  requireUser: async () => {
    if (!h.user) { const { NextResponse } = await import("next/server"); return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
    return { userId: h.user, redis };
  },
  clean: (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : ""),
}));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: async (id: string) => h.ents[id] ?? { plan: "free", status: "verified" } }));

import { DELETE, GET, PATCH, POST } from "@/app/api/me/plans/route";
import { plansKey } from "@/lib/tradePlansAtomic";
import { planLimitsAr, planLimitsEn, planLimitsFr } from "@/lib/i18nPlanLimits";
import { LIMIT_ENFORCEMENT, PLAN_LIMITS } from "@/lib/entitlementConfig";

const req = (method: string, body?: unknown) => new Request("http://x/api/me/plans", { method, body: body === undefined ? undefined : JSON.stringify(body) });
let n = 0;
const body = (o: Record<string, unknown> = {}) => ({ pair: `C${++n}usdt`, direction: "Long", timeframe: "4H", entryZone: "1-2", invalidationText: "0.5", entry: "1", invalidation: "0.5", tp1: "2", tp2: "3", tp3: "4", reasoning: "r", ...o });
const save = (o?: Record<string, unknown>) => POST(req("POST", body(o)));
const list = async (u = h.user as string) => Object.values((await redis.hgetall(plansKey(u))) ?? {}) as Array<Record<string, unknown>>;
const seed = (u: string, count: number, status?: string) => { for (let i = 0; i < count; i++) { const id = `s${u}${status ?? "a"}${i}`; redis.hset(plansKey(u), { [id]: { id, createdAt: i, pair: `S${i}${status ?? ""}USDT`, direction: "Long", timeframe: "", entryZone: "", invalidationText: "", entry: "", invalidation: "", tp1: "", tp2: "", tp3: "", reasoning: "", ...(status ? { status } : {}) } }); } };

beforeEach(() => { h.hashes.clear(); h.user = "u1"; h.ents = {}; n = 0; });

describe("limits (from the central entitlement config)", () => {
  it("the limits are the configured ones and enforcement is live", () => {
    expect(PLAN_LIMITS.free.activeTradePlans).toBe(5);
    expect(PLAN_LIMITS.elite.activeTradePlans).toBe(50);
    expect(LIMIT_ENFORCEMENT.activeTradePlans).toBe("live");
  });
  it("Free saves 5 and the 6th is refused with 409, the limit and plan; nothing is stored", async () => {
    for (let i = 0; i < 5; i++) expect((await save()).status).toBe(201);
    const res = await save();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "limit", code: "plan_limit", limit: 5, plan: "free", active: 5 });
    expect(await list()).toHaveLength(5);
  });
  it("ELITE saves 50 and the 51st is refused", async () => {
    h.ents.u1 = { plan: "elite", status: "verified" };
    seed("u1", 49);
    expect((await save()).status).toBe(201);
    const res = await save();
    expect(res.status).toBe(409);
    expect((await res.json()).limit).toBe(50);
  });
  it("a verified ELITE answer served from the cache or the stale grace is used as ELITE", async () => {
    for (const status of ["cached", "stale"]) { h.hashes.clear(); h.ents.u1 = { plan: "elite", status }; seed("u1", 20); expect((await save()).status).toBe(201); }
  });
  it("plans saved as already Entered are not limited, and Entered / Archived plans never count", async () => {
    seed("u1", 5);
    seed("u1", 4, "entered");
    seed("u1", 4, "archived");
    expect((await save()).status).toBe(409);
    expect((await save({ status: "entered" })).status).toBe(201);
  });
  it("accounts are independent: another member's plans never count", async () => {
    seed("other", 5);
    expect((await save()).status).toBe(201);
  });
});

describe("unverified membership is never treated as Free", () => {
  beforeEach(() => { h.ents.u1 = { plan: "free", status: "unverified" }; });
  it("an ELITE member's save during a Clerk outage gets a retryable 503 and nothing is written", async () => {
    const res = await save();
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(await res.json()).toMatchObject({ code: "membership_unverified", retryable: true });
    expect(await list()).toHaveLength(0);
  });
  it("Restore is also refused (503); Entered, Archived, Delete and reading still work", async () => {
    seed("u1", 2);
    seed("u1", 1, "archived");
    const [a, b] = (await list()).filter((p) => !p.status).map((p) => p.id as string);
    const arch = (await list()).find((p) => p.status === "archived")!.id as string;
    expect((await PATCH(req("PATCH", { id: arch, action: "restore" }))).status).toBe(503);
    expect((await PATCH(req("PATCH", { id: a, action: "entered" }))).status).toBe(200);
    expect((await PATCH(req("PATCH", { id: b, action: "archived" }))).status).toBe(200);
    expect((await save({ status: "entered" })).status).toBe(201);
    const got = await (await GET()).json();
    expect(got.unverified).toBe(true);
    expect(got.limit).toBeUndefined();
    expect(got.plans.length).toBe(4);
    expect((await DELETE(req("DELETE", { id: a }))).status).toBe(200);
  });
});

describe("duplicates", () => {
  it("saving the same plan twice (double click / retry) stores one and says so; it does not use a slot", async () => {
    const b = body({ pair: "SOLUSDT" });
    const first = await POST(req("POST", b));
    expect(first.status).toBe(201);
    const second = await POST(req("POST", { ...b, reasoning: "retyped notes" }));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true, plan: { id: (await first.json()).plan?.id ?? expect.anything() } });
    expect(await list()).toHaveLength(1);
  });
  it("a duplicate is recognised even when the member is at the limit", async () => {
    const b = body({ pair: "SOLUSDT" });
    await POST(req("POST", b));
    for (let i = 0; i < 4; i++) await save();
    expect((await POST(req("POST", b))).status).toBe(200);
    expect(await list()).toHaveLength(5);
  });
  it("20 simultaneous identical saves store exactly one plan", async () => {
    const b = body({ pair: "DOGEUSDT" });
    const res = await Promise.all(Array.from({ length: 20 }, () => POST(req("POST", b))));
    expect(res.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(await list()).toHaveLength(1);
  });
});

describe("concurrency", () => {
  it("30 simultaneous different saves with limit 5: exactly 5 are stored", async () => {
    const res = await Promise.all(Array.from({ length: 30 }, () => save()));
    expect(res.filter((r) => r.status === 201)).toHaveLength(5);
    expect(res.filter((r) => r.status === 409)).toHaveLength(25);
    expect(await list()).toHaveLength(5);
  });
});

describe("Entered / Archived / Restore", () => {
  it("Entered and Archived keep the plan and all its levels, free a slot, and the next save works", async () => {
    for (let i = 0; i < 5; i++) await save({ pair: "KEEPUSDT", tp1: String(10 + i) });
    const [p] = await list();
    const res = await PATCH(req("PATCH", { id: p.id, action: "entered" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ changed: true, plan: { id: p.id, status: "entered", entryZone: "1-2", invalidationText: "0.5", reasoning: "r" } });
    expect((await list()).find((x) => x.id === p.id)).toMatchObject({ pair: "KEEPUSDT", tp1: p.tp1, tp3: "4" });
    expect((await save()).status).toBe(201);
    expect((await save()).status).toBe(409);
    const [q] = (await list()).filter((x) => !x.status || x.status === "draft");
    expect((await PATCH(req("PATCH", { id: q.id, action: "archived" }))).status).toBe(200);
    expect((await save()).status).toBe(201);
  });
  it("Restore is refused with 409 at the limit and works when there is room; repeating an action changes nothing", async () => {
    seed("u1", 5);
    seed("u1", 1, "archived");
    const arch = (await list()).find((p) => p.status === "archived")!.id as string;
    const refused = await PATCH(req("PATCH", { id: arch, action: "restore" }));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "plan_limit", limit: 5 });
    const one = (await list()).find((p) => !p.status)!.id as string;
    await PATCH(req("PATCH", { id: one, action: "entered" }));
    expect((await PATCH(req("PATCH", { id: arch, action: "restore" }))).status).toBe(200);
    expect(await (await PATCH(req("PATCH", { id: arch, action: "restore" }))).json()).toMatchObject({ changed: false });
  });
  it("an over-limit (downgraded) member keeps every plan and can manage them, but cannot add or restore", async () => {
    seed("u1", 9);
    expect((await save()).status).toBe(409);
    const ids = (await list()).map((p) => p.id as string);
    expect((await PATCH(req("PATCH", { id: ids[0], action: "archived" }))).status).toBe(200);
    expect((await DELETE(req("DELETE", { id: ids[1] }))).status).toBe(200);
    expect(await list()).toHaveLength(8);
    const got = await (await GET()).json();
    expect(got).toMatchObject({ active: 7, limit: 5, plan: "free" });
    expect((await PATCH(req("PATCH", { id: ids[0], action: "restore" }))).status).toBe(409);
  });
  it("rejects bad input, unknown plans, other members' plans, and signed-out requests", async () => {
    seed("other", 1);
    const otherId = (await list("other"))[0].id as string;
    expect((await PATCH(req("PATCH", { id: "x", action: "bogus" }))).status).toBe(400);
    expect((await PATCH(req("PATCH", { action: "entered" }))).status).toBe(400);
    expect((await PATCH(req("PATCH", { id: "nope", action: "entered" }))).status).toBe(404);
    expect((await PATCH(req("PATCH", { id: otherId, action: "archived" }))).status).toBe(404);
    expect((await list("other"))[0].status).toBeUndefined();
    h.user = null;
    for (const r of [await GET(), await POST(req("POST", body())), await PATCH(req("PATCH", { id: "a", action: "entered" }))]) expect(r.status).toBe(401);
  });
  it("GET reports the active count and the limit; plans saved before this phase keep working", async () => {
    seed("u1", 3);
    seed("u1", 2, "entered");
    expect(await (await GET()).json()).toMatchObject({ active: 3, limit: 5, plan: "free" });
  });
});

describe("local drafts, UI and translations", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  it("local Trade Plan drafts never touch the server, so they never count", () => {
    expect(read("lib/tradeDrafts.ts")).not.toMatch(/fetch\(|api\/me\/plans/);
    expect(read("components/tradeplan/DraftsPanel.tsx")).not.toMatch(/fetch\(|api\/me\/plans/);
  });
  it("the account page offers Entered, Archive and Restore through PATCH and explains limits; the Trade Plan page handles 409, 503 and duplicates", () => {
    const a = read("app/account/page.tsx");
    for (const s of ['method: "PATCH"', "planLimits.markEntered", "planLimits.archive", "planLimits.restore", "planLimits.limitReached", "planLimits.overLimit", "planLimits.unverified"]) expect(a).toContain(s);
    const p = read("app/trade-plan/page.tsx");
    for (const s of ["res.status === 409", "res.status === 503", "data.duplicate", "planLimits.limitReached", "planLimits.unverified", "planLimits.alreadySaved"]) expect(p).toContain(s);
    expect(a + p).not.toMatch(/activeTradePlans:\s*\d|limit\s*=\s*5\b/);
  });
  it("EN, FR and AR have identical keys and placeholders, and are all registered in i18n", () => {
    const keys = (d: Record<string, string>) => Object.keys(d).sort();
    expect(keys(planLimitsFr)).toEqual(keys(planLimitsEn));
    expect(keys(planLimitsAr)).toEqual(keys(planLimitsEn));
    for (const k of keys(planLimitsEn)) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(ph(planLimitsFr[k]), k).toBe(ph(planLimitsEn[k]));
      expect(ph(planLimitsAr[k]), k).toBe(ph(planLimitsEn[k]));
    }
    const i18n = i18nSource();
    for (const L of ["En", "Fr", "Ar"]) expect(i18n).toContain(`planLimits: { ...planLimits${L} }`);
  });
});
