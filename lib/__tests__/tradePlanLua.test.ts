// PHASE-3B: PLAN_ADD_SCRIPT / PLAN_STATUS_SCRIPT and the real addPlan() / setPlanStatus() against a REAL Redis (redis-server + redis-cli)
// with truly concurrent requests. Skipped where redis-server is not installed. This proves the Lua on Redis, NOT on Upstash.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { addPlan, plansKey, setPlanStatus, countActive, type PlansRedis } from "@/lib/tradePlansAtomic";
import type { SavedPlan } from "@/lib/savedPlans";

const run = promisify(execFile);
const PORT = String(20000 + Math.floor(Math.random() * 20000));
const have = (() => { try { execFileSync("redis-server", ["--version"], { stdio: "ignore" }); execFileSync("redis-cli", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();
let server: ChildProcess | null = null;
const cli = async (...args: string[]) => (await run("redis-cli", ["-p", PORT, ...args], { maxBuffer: 1 << 24 })).stdout.replace(/\n$/, "");
// Mimics Upstash: hget returns the parsed JSON; eval returns the script's reply.
const redis: PlansRedis = {
  hget: async <T,>(k: string, f: string) => { const v = await cli("HGET", k, f); if (v === "") return null; try { return JSON.parse(v) as T; } catch { return v as unknown as T; } },
  eval: async (script, keys, args) => await cli("EVAL", script, String(keys.length), ...keys, ...args),
};
let n = 0;
const plan = (o: Partial<SavedPlan> = {}): SavedPlan => ({ id: `p${++n}`, createdAt: n, pair: `C${n}USDT`, direction: "Long", timeframe: "4H", entryZone: "1-2", invalidationText: "0.5", entry: "1", invalidation: "0.5", tp1: "2", tp2: "3", tp3: "4", reasoning: "", status: "draft", ...o });
const stored = async (u: string) => Object.values(JSON.parse((await cli("EVAL", "local a=redis.call('HGETALL',KEYS[1]) local o={} for i=1,#a,2 do o[#o+1]=a[i+1] end return '['..table.concat(o,',')..']'", "1", plansKey(u))) || "[]") as SavedPlan[]);
const seed = async (u: string, count: number, status?: string) => { for (let i = 0; i < count; i++) { const p = plan({ ...(status ? { status: status as SavedPlan["status"] } : {}) }); await cli("HSET", plansKey(u), p.id, JSON.stringify(p)); } };

beforeAll(async () => {
  if (!have) return;
  server = spawn("redis-server", ["--port", PORT, "--save", "", "--appendonly", "no", "--bind", "127.0.0.1"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await cli("PING")) === "PONG") return; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("redis-server did not start");
});
afterAll(() => { server?.kill(); });

describe.skipIf(!have)("addPlan on a real Redis", () => {
  it("allows up to the limit and refuses the next one; nothing extra is stored", async () => {
    for (let i = 0; i < 5; i++) expect((await addPlan(redis, "a", plan(), 5)).ok).toBe(true);
    expect(await addPlan(redis, "a", plan(), 5)).toEqual({ ok: false, error: "limit" });
    expect(await stored("a")).toHaveLength(5);
  });
  it("Entered and Archived plans are not active: they do not count, and an entered plan can be saved at the limit", async () => {
    await seed("b", 5);
    await seed("b", 3, "entered");
    await seed("b", 3, "archived");
    expect((await addPlan(redis, "b", plan(), 5)).ok).toBe(false);
    expect((await addPlan(redis, "b", plan({ status: "entered" }), 5)).ok).toBe(true);
  });
  it("legacy plans without a status count as active", async () => {
    for (let i = 0; i < 5; i++) { const p = plan(); delete (p as Partial<SavedPlan>).status; await cli("HSET", plansKey("c"), p.id, JSON.stringify(p)); }
    expect((await addPlan(redis, "c", plan(), 5)).ok).toBe(false);
  });
  it("an identical ACTIVE plan is a duplicate: the existing plan comes back, nothing new is stored, even at the limit", async () => {
    const first = plan({ pair: "SOLUSDT" });
    expect((await addPlan(redis, "d", first, 2)).ok).toBe(true);
    const again = await addPlan(redis, "d", plan({ ...first, id: "other", reasoning: "different notes" }), 2);
    expect(again).toMatchObject({ ok: true, duplicate: true, plan: { id: first.id } });
    expect(await stored("d")).toHaveLength(1);
    expect((await addPlan(redis, "d", plan(), 2)).ok).toBe(true);
    expect((await addPlan(redis, "d", plan({ ...first, id: "x" }), 2))).toMatchObject({ ok: true, duplicate: true });
  });
  it("the same setup is allowed again once the earlier one is Entered or Archived", async () => {
    const first = plan({ pair: "ADAUSDT" });
    await addPlan(redis, "e", first, 5);
    await setPlanStatus(redis, "e", first.id, "archived", 5);
    expect(await addPlan(redis, "e", plan({ ...first, id: "again" }), 5)).toMatchObject({ ok: true, duplicate: false });
  });
  it("an over-limit (downgraded) member cannot add but keeps every plan", async () => {
    await seed("f", 9);
    expect((await addPlan(redis, "f", plan(), 5)).ok).toBe(false);
    expect(await stored("f")).toHaveLength(9);
  });
  it("40 parallel adds with limit 5: exactly 5 land, even from concurrent requests", async () => {
    const res = await Promise.all(Array.from({ length: 40 }, () => addPlan(redis, "g", plan(), 5)));
    expect(res.filter((r) => r.ok).length).toBe(5);
    expect(res.filter((r) => !r.ok).every((r) => !r.ok && r.error === "limit")).toBe(true);
    expect(await stored("g")).toHaveLength(5);
  });
  it("40 parallel identical saves store exactly one plan", async () => {
    const base = plan({ pair: "DOGEUSDT" });
    const res = await Promise.all(Array.from({ length: 40 }, (_, i) => addPlan(redis, "h", { ...base, id: `dup${i}` }, 5)));
    expect(res.every((r) => r.ok)).toBe(true);
    expect(await stored("h")).toHaveLength(1);
  });
  it("parallel adds that are all different never lose a plan that reported success", async () => {
    await seed("i", 10);
    const res = await Promise.all(Array.from({ length: 8 }, () => addPlan(redis, "i", plan(), 50)));
    expect(res.every((r) => r.ok)).toBe(true);
    expect(await stored("i")).toHaveLength(18);
  });
});

describe.skipIf(!have)("setPlanStatus on a real Redis", () => {
  it("Entered and Archived free an active slot and are allowed at or over the limit", async () => {
    await seed("s1", 7);
    const ids = (await stored("s1")).map((p) => p.id);
    expect(await setPlanStatus(redis, "s1", ids[0], "entered", 5, 1_700_000_000_000)).toMatchObject({ ok: true, changed: true, plan: { status: "entered", enteredAt: "2023-11-14" } });
    expect(await setPlanStatus(redis, "s1", ids[1], "archived", 5)).toMatchObject({ ok: true, plan: { status: "archived" } });
    expect(countActive(await stored("s1"))).toBe(5);
  });
  it("a plan keeps every original level and field when its status changes", async () => {
    const p = plan({ pair: "XRPUSDT", reasoning: "keep me", signal: { id: "s", hitLevels: [] } as never });
    await addPlan(redis, "s2", p, 5);
    await setPlanStatus(redis, "s2", p.id, "archived", 5);
    const [after] = await stored("s2");
    expect(after).toMatchObject({ pair: "XRPUSDT", entryZone: "1-2", tp1: "2", tp3: "4", reasoning: "keep me", status: "archived" });
    expect(after.signal).toEqual({ id: "s", hitLevels: [] });
  });
  it("Restore needs a free slot: refused (limit) at the limit, allowed once there is room", async () => {
    await seed("s3", 5);
    const p = plan({ status: "archived" });
    await cli("HSET", plansKey("s3"), p.id, JSON.stringify(p));
    expect(await setPlanStatus(redis, "s3", p.id, "restore", 5)).toEqual({ ok: false, error: "limit" });
    const one = (await stored("s3")).find((x) => x.status === "draft")!;
    await setPlanStatus(redis, "s3", one.id, "archived", 5);
    expect(await setPlanStatus(redis, "s3", p.id, "restore", 5)).toMatchObject({ ok: true, plan: { status: "draft" } });
  });
  it("repeating an action is a no-op; an unknown plan is not found", async () => {
    const p = plan();
    await addPlan(redis, "s4", p, 5);
    expect(await setPlanStatus(redis, "s4", p.id, "entered", 5)).toMatchObject({ ok: true, changed: true });
    expect(await setPlanStatus(redis, "s4", p.id, "entered", 5)).toMatchObject({ ok: true, changed: false });
    expect(await setPlanStatus(redis, "s4", "nope", "archived", 5)).toEqual({ ok: false, error: "notfound" });
  });
  it("10 parallel restores into 2 free slots: exactly 2 succeed", async () => {
    await seed("s5", 3);
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) { const p = plan({ status: "archived" }); ids.push(p.id); await cli("HSET", plansKey("s5"), p.id, JSON.stringify(p)); }
    const res = await Promise.all(ids.map((id) => setPlanStatus(redis, "s5", id, "restore", 5)));
    expect(res.filter((r) => r.ok).length).toBe(2);
    expect(countActive(await stored("s5"))).toBe(5);
  });
});
