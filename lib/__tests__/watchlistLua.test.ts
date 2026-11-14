// PHASE-3A: runs WATCHLIST_WRITE_SCRIPT and the real updateWatchlist() against a REAL Redis (redis-server + redis-cli),
// with truly concurrent requests. Skipped automatically where redis-server is not installed (e.g. a Windows dev machine).
// This proves the Lua logic on Redis. It does NOT prove Upstash compatibility (see the Phase 3A report).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { WATCHLIST_WRITE_SCRIPT, updateWatchlist, watchlistKey, watchlistRevKey, type WatchRedis } from "@/lib/watchlistAtomic";

const run = promisify(execFile);
const PORT = String(20000 + Math.floor(Math.random() * 20000));
const have = (() => { try { execFileSync("redis-server", ["--version"], { stdio: "ignore" }); execFileSync("redis-cli", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();

let server: ChildProcess | null = null;
const cli = async (...args: string[]) => (await run("redis-cli", ["-p", PORT, ...args], { maxBuffer: 1 << 24 })).stdout.replace(/\n$/, "");
// Mimics Upstash's JSON auto-deserialization on get().
const redis: WatchRedis = {
  get: async <T,>(k: string) => { const v = await cli("GET", k); if (v === "") return null; try { return JSON.parse(v) as T; } catch { return v as unknown as T; } },
  eval: async (script, keys, args) => Number(await cli("EVAL", script, String(keys.length), ...keys, ...args)),
};
const state = (n: number, from = 0) => JSON.stringify({ items: Array.from({ length: n }, (_, i) => ({ symbol: `S${from + i}USDT`, addedAt: 1 })), seen: {} });
const evalScript = (key: string, expectedRev: number, json: string, limit: number) =>
  redis.eval(WATCHLIST_WRITE_SCRIPT, [key, `${key}:rev`], [String(expectedRev), json, String(limit)]);

beforeAll(async () => {
  if (!have) return;
  server = spawn("redis-server", ["--port", PORT, "--save", "", "--appendonly", "no", "--bind", "127.0.0.1"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await cli("PING")) === "PONG") return; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("redis-server did not start");
});
afterAll(() => { server?.kill(); });

describe.skipIf(!have)("WATCHLIST_WRITE_SCRIPT on a real Redis", () => {
  it("writes and bumps the revision; a stale revision is refused (0) and writes nothing", async () => {
    expect(await evalScript("t:a", 0, state(2), 5)).toBe(1);
    expect(await cli("GET", "t:a:rev")).toBe("1");
    expect(await evalScript("t:a", 0, state(3), 5)).toBe(0);
    expect(JSON.parse(await cli("GET", "t:a")).items).toHaveLength(2);
  });
  it("refuses growing past the limit (-1) but allows equal or smaller writes when already over the limit", async () => {
    await cli("SET", "t:b", state(8));
    expect(await evalScript("t:b", 0, state(9), 5)).toBe(-1);
    expect(await evalScript("t:b", 0, state(8), 5)).toBe(1); // same size: allowed
    expect(await evalScript("t:b", 1, state(7), 5)).toBe(1); // shrinking: allowed
    expect(JSON.parse(await cli("GET", "t:b")).items).toHaveLength(7);
  });
  it("a limit-sized list exactly at the limit is allowed; one more is not", async () => {
    expect(await evalScript("t:c", 0, state(5), 5)).toBe(1);
    expect(await evalScript("t:c", 1, state(6), 5)).toBe(-1);
  });
  it("treats an existing garbage value as an empty list, and refuses an invalid payload (-2)", async () => {
    await cli("SET", "t:d", "not json");
    expect(await evalScript("t:d", 0, state(1), 5)).toBe(1);
    expect(await evalScript("t:d", 1, "garbage", 5)).toBe(-2);
    expect(await evalScript("t:d", 1, JSON.stringify({ nope: true }), 5)).toBe(-2);
  });
  it("an existing list written by the old code (no revision key) is accepted at revision 0", async () => {
    await cli("SET", "t:e", state(3));
    expect(await evalScript("t:e", 0, state(4), 5)).toBe(1);
  });
  it("an empty list round-trips (cjson empty array)", async () => {
    expect(await evalScript("t:f", 0, state(0), 5)).toBe(1);
    expect(JSON.parse(await cli("GET", "t:f")).items).toEqual([]);
  });
});

describe.skipIf(!have)("updateWatchlist() with truly concurrent requests on a real Redis", () => {
  const add = (u: string, symbol: string, limit: number) => updateWatchlist(redis, u, { op: "add", symbol }, limit);
  const stored = async (u: string) => (await redis.get<{ items: { symbol: string }[] }>(watchlistKey(u)))?.items.map((i) => i.symbol) ?? [];

  it("30 parallel adds with limit 5: exactly 5 land, the rest are refused or told to retry, nothing duplicated", async () => {
    const res = await Promise.all(Array.from({ length: 30 }, (_, i) => add("c1", `P${i}`, 5)));
    const landed = res.filter((r) => r.ok).length;
    expect(landed).toBe(5);
    expect((await stored("c1")).length).toBe(5);
    expect(new Set(await stored("c1")).size).toBe(5);
    expect(res.every((r) => r.ok || r.error === "limit" || r.error === "busy")).toBe(true);
  });
  it("parallel adds under the limit never lose a coin that reported success, and never lose existing coins", async () => {
    await cli("SET", watchlistKey("c2"), state(10));
    const res = await Promise.all(Array.from({ length: 8 }, (_, i) => add("c2", `N${i}`, 50)));
    const okSyms = res.flatMap((r, i) => (r.ok ? [`N${i}USDT`] : []));
    const now = await stored("c2");
    for (const s of okSyms) expect(now).toContain(s);
    for (let i = 0; i < 10; i++) expect(now).toContain(`S${i}USDT`);
    expect(now).toHaveLength(10 + okSyms.length);
    expect(await cli("GET", watchlistRevKey("c2"))).toBe(String(okSyms.length));
  });
  it("an over-limit list can be removed from while adds are refused", async () => {
    await cli("SET", watchlistKey("c3"), state(9));
    expect((await add("c3", "NEWCOIN", 5)).ok).toBe(false);
    expect((await updateWatchlist(redis, "c3", { op: "remove", symbol: "S0" }, 5)).ok).toBe(true);
    expect(await stored("c3")).toHaveLength(8);
  });
});
