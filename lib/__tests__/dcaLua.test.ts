// PHASE-3C: INVESTOR_WRITE_SCRIPT and writeInvestor() against a REAL Redis with truly concurrent writers. Skipped when redis-server is
// not installed. This proves the Lua on Redis, NOT on Upstash.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { investorKey, investorRevKey, writeInvestor, type InvestorRedis } from "@/lib/investor/atomic";

const run = promisify(execFile);
const PORT = String(20000 + Math.floor(Math.random() * 20000));
const have = (() => { try { execFileSync("redis-server", ["--version"], { stdio: "ignore" }); execFileSync("redis-cli", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();
let server: ChildProcess | null = null;
const cli = async (...args: string[]) => (await run("redis-cli", ["-p", PORT, ...args], { maxBuffer: 1 << 24 })).stdout.replace(/\n$/, "");
const redis: InvestorRedis = { eval: async (script, keys, args) => Number(await cli("EVAL", script, String(keys.length), ...keys, ...args)) };
const docJson = (revision: number, extra: Record<string, unknown> = {}) => JSON.stringify({ revision, purchases: [], sales: [], cash: [], plans: [], manualPrices: {}, bnbDiscount: false, ...extra });

beforeAll(async () => {
  if (!have) return;
  server = spawn("redis-server", ["--port", PORT, "--save", "", "--appendonly", "no", "--bind", "127.0.0.1"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await cli("PING")) === "PONG") return; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("redis-server did not start");
});
afterAll(() => { server?.kill(); });

describe.skipIf(!have)("writeInvestor on a real Redis", () => {
  it("a new user writes at revision 0, and the revision key follows", async () => {
    expect(await writeInvestor(redis, "a", { revision: 1 }, 0)).toBe(true);
    expect(await cli("GET", investorRevKey("a"))).toBe("1");
    expect(JSON.parse(await cli("GET", investorKey("a"))).revision).toBe(1);
  });
  it("an existing document with no revision key (saved before this phase) takes its revision from the document", async () => {
    await cli("SET", investorKey("b"), docJson(7, { plans: [{ id: "p" }] }));
    expect(await writeInvestor(redis, "b", { revision: 6 }, 6)).toBe(false);
    expect(await writeInvestor(redis, "b", { revision: 8 }, 7)).toBe(true);
    expect(await cli("GET", investorRevKey("b"))).toBe("8");
  });
  it("a stale revision writes nothing", async () => {
    await writeInvestor(redis, "c", { revision: 1 }, 0);
    expect(await writeInvestor(redis, "c", { revision: 1, hacked: true } as never, 0)).toBe(false);
    expect(JSON.parse(await cli("GET", investorKey("c")))).toEqual({ revision: 1 });
  });
  it("the stored document keeps empty arrays and objects exactly as written (nothing is re-encoded by Lua)", async () => {
    const raw = docJson(1);
    expect(await redis.eval("redis.call('SET', KEYS[1], ARGV[1]) return 1", [investorKey("d")], [raw])).toBe(1);
    await writeInvestor(redis, "d", JSON.parse(docJson(2)), 1);
    expect(await cli("GET", investorKey("d"))).toBe(docJson(2));
  });
  it("40 truly parallel writers from the same revision: exactly one wins and the revision moves by one", async () => {
    const res = await Promise.all(Array.from({ length: 40 }, (_, i) => writeInvestor(redis, "e", { revision: 1, writer: i } as never, 0)));
    expect(res.filter(Boolean)).toHaveLength(1);
    expect(await cli("GET", investorRevKey("e"))).toBe("1");
  });
  it("a chain of writers each from the latest revision all succeed in order", async () => {
    for (let i = 0; i < 10; i++) expect(await writeInvestor(redis, "f", { revision: i + 1 }, i)).toBe(true);
    expect(await cli("GET", investorRevKey("f"))).toBe("10");
  });
});
