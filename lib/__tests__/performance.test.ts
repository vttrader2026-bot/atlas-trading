// PERFORMANCE-v1: analytics are pure, net of fees, closed-trades-only and reconcile with the Journal dashboard.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { computeDashboard, type Trade } from "@/lib/journal";
import { applyExit, partialRealizedTotal } from "@/lib/exits";
import {
  byCoin, byMonth, closedTrades, computePerformance, equityCurve, expectancy, maxDrawdown, normalizeCoin,
  profitFactor, rMultiples, sortRows, streaks,
} from "@/lib/performance";

let seq = 0;
/** Closed long trade: entry 100, size 1 -> pnl = exit - 100 - fees. */
const mk = (o: Partial<Trade> = {}): Trade => ({
  id: `t${++seq}`, date: "2026-01-01", pair: "BTCUSDT", side: "Long", entry: 100, stop: 90, target: 120, exit: 110, size: 1, notes: "",
  status: "closed", exitDate: "2026-01-05", ...o,
});
const win = (n: number, o: Partial<Trade> = {}) => mk({ exit: 100 + n, ...o });
const loss = (n: number, o: Partial<Trade> = {}) => mk({ exit: 100 - n, ...o });
const pnls = (ts: Trade[]) => closedTrades(ts).map((c) => c.pnl);

describe("profit factor", () => {
  it("gross profit / gross loss", () => expect(profitFactor(closedTrades([win(30), win(10), loss(20)])).value).toBeCloseTo(2, 9));
  it("n/a (null, never Infinity) with no losing trade", () => {
    const pf = profitFactor(closedTrades([win(30)]));
    expect(pf.value).toBeNull();
    expect(pf.grossProfit).toBe(30);
  });
  it("n/a with no trades and with only breakeven", () => {
    expect(profitFactor([]).value).toBeNull();
    expect(profitFactor(closedTrades([mk({ exit: 100 })])).value).toBeNull();
  });
  it("0 when there are only losses; breakeven is in neither sum", () => {
    expect(profitFactor(closedTrades([loss(5), mk({ exit: 100 })])).value).toBe(0);
  });
});

describe("expectancy", () => {
  it("average net result per closed trade, breakeven kept in the denominator", () => {
    const e = expectancy(closedTrades([win(30), loss(10), mk({ exit: 100 })]));
    expect(e.usd).toBeCloseTo(20 / 3, 9);
    expect(e.pct).toBeCloseTo((30 - 10 + 0) / 3, 9); // invested 100 each
  });
  it("null without trades", () => expect(expectancy([])).toEqual({ usd: null, pct: null }));
});

describe("fees and partial exits are counted once", () => {
  it("net P&L deducts the fee once", () => {
    expect(pnls([win(30, { fees: 2 })])).toEqual([28]);
  });
  it("a fully-sold partial-exit trade equals the Journal's own number, not double-counted", () => {
    let t: Trade = mk({ status: "open", exit: null, exitDate: null, size: 10, tp1: 110, tp2: 120, tp3: 130, exitStrategy: "split", fees: 4 });
    for (const [level, price, date] of [["TP1", 110, "2026-01-03"], ["TP2", 120, "2026-01-04"], ["TP3", 130, "2026-01-06"]] as const) {
      const r = applyExit(t, { level, price, date });
      expect(r.ok).toBe(true);
      if (r.ok) t = r.trade;
    }
    expect(t.status).toBe("closed");
    // 3*10 + 4*20 + 3*30 = 200 gross, minus 4 fees
    const c = closedTrades([t]);
    expect(c).toHaveLength(1);
    expect(c[0].pnl).toBeCloseTo(196, 9);
    expect(c[0].closeDate).toBe("2026-01-06");
    expect(computePerformance([t]).netPnl).toBeCloseTo(computeDashboard([t]).realizedPnl, 9);
  });
  it("an open trade with a partial exit is excluded (it stays in 'Partial realized')", () => {
    const r = applyExit(mk({ status: "open", exit: null, exitDate: null, size: 10, tp1: 110, tp2: 120, tp3: 130, exitStrategy: "split" }), { level: "TP1", price: 110, date: "2026-01-03" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(partialRealizedTotal([r.trade])).not.toBeNull();
    expect(computePerformance([r.trade]).count).toBe(0);
  });
  it("open trades are ignored", () => expect(computePerformance([mk({ status: "open", exit: null, exitDate: null })]).count).toBe(0));
});

describe("equity curve", () => {
  const set = [
    win(30, { exitDate: "2026-02-10", fees: 1 }), loss(20, { exitDate: "2026-01-20" }), win(5, { exitDate: "2026-03-01", pair: "ETH/USDT" }),
    mk({ exit: 100, exitDate: "2026-03-02" }), loss(8, { exitDate: "2026-03-05", pair: "solusdt", fees: 0.5 }),
    mk({ status: "open", exit: null, exitDate: null }),
  ];
  it("ends exactly at computeDashboard().realizedPnl", () => {
    const p = computePerformance(set);
    expect(p.netPnl).toBeCloseTo(computeDashboard(set).realizedPnl, 9);
    expect(p.count).toBe(computeDashboard(set).closed);
  });
  it("orders by exit date, starts from 0, accumulates", () => {
    const c = equityCurve(closedTrades(set));
    expect(c.map((p) => p.date)).toEqual(["2026-01-20", "2026-02-10", "2026-03-01", "2026-03-02", "2026-03-05"]);
    expect(c[0].equity).toBe(-20);
    expect(c[1].equity).toBe(9);
  });
  it("ties on the same day use last update, then entry date, then id (stable)", () => {
    const a = win(10, { exitDate: "2026-02-01", updatedAt: 200, id: "a" });
    const b = loss(4, { exitDate: "2026-02-01", updatedAt: 100, id: "b" });
    expect(closedTrades([a, b]).map((c) => c.trade.id)).toEqual(["b", "a"]);
    const c1 = win(1, { exitDate: "2026-02-01", id: "x" }), c2 = win(2, { exitDate: "2026-02-01", id: "w" });
    expect(closedTrades([c1, c2]).map((c) => c.trade.id)).toEqual(["w", "x"]);
  });
  it("legacy trades without an exit date use the entry date and are flagged", () => {
    const legacy = mk({ exitDate: null, date: "2025-12-01", exit: 110 });
    const c = closedTrades([legacy])[0];
    expect(c.closeDate).toBe("2025-12-01");
    expect(c.approxDate).toBe(true);
    expect(computePerformance([legacy, win(5)]).legacyCount).toBe(1);
  });
  it("empty input is safe", () => {
    const p = computePerformance([]);
    expect(p.curve).toEqual([]);
    expect(p.netPnl).toBe(0);
    expect(p.drawdown.usd).toBe(0);
  });
});

describe("estimated stop exits", () => {
  const est = loss(10, { exitSource: "auto-sl", autoSl: { detectedAt: 1, touchedAt: 1, low: 89, estimatedExit: 90 } });
  const fixed = loss(12, { exitSource: "auto-sl", autoSl: { detectedAt: 1, touchedAt: 1, low: 89, estimatedExit: 90, correctedAt: 5, correctedPrice: 88 } });
  it("flags only uncorrected automatic exits", () => {
    const c = closedTrades([est, fixed, win(3)]);
    expect(Object.fromEntries(c.map((x) => [x.trade.id, x.estimated]))).toMatchObject({ [est.id]: true, [fixed.id]: false });
    expect(c.filter((x) => x.estimated)).toHaveLength(1);
    expect(computePerformance([est, fixed, win(3)]).estimatedCount).toBe(1);
  });
  it("the toggle removes them from every metric", () => {
    const on = computePerformance([est, win(30)], { includeEstimated: true });
    const off = computePerformance([est, win(30)], { includeEstimated: false });
    expect(on.count).toBe(2);
    expect(off.count).toBe(1);
    expect(off.profitFactor.value).toBeNull();
    expect(off.netPnl).toBe(30);
  });
});

describe("R-multiple (current stop)", () => {
  it("net P&L / planned loss, with included and excluded counts", () => {
    const r = rMultiples(closedTrades([win(20), loss(10), mk({ stop: 0 }), mk({ stop: 100 }), mk({ stop: 120 })]));
    expect(r.included).toBe(2);
    expect(r.excluded).toBe(3);
    expect(r.avg).toBeCloseTo((2 + -1) / 2, 9); // risk 10 each
  });
  it("uses net P&L after fees and counts estimated trades included", () => {
    const t = win(20, { fees: 10, exitSource: "auto-sl", autoSl: { detectedAt: 1, touchedAt: 1, low: 1, estimatedExit: 120 } });
    const r = rMultiples(closedTrades([t]));
    expect(r.avg).toBeCloseTo(1, 9);
    expect(r.estimatedIncluded).toBe(1);
  });
  it("null average when nothing qualifies", () => expect(rMultiples(closedTrades([mk({ stop: 0 })])).avg).toBeNull());
});

describe("maximum drawdown", () => {
  const dd = (xs: number[], eq?: number | null) => maxDrawdown(equityCurve(closedTrades(xs.map((n, i) => mk({ exit: 100 + n, exitDate: `2026-02-${String(i + 1).padStart(2, "0")}` })))), eq);
  it("largest peak-to-trough fall, peak starting at 0", () => {
    // equity: 10, 30, 5, 15, -10  -> peak 30 trough -10 = 40
    const d = dd([10, 20, -25, 10, -25]);
    expect(d.usd).toBe(40);
    expect(d.peakN).toBe(2);
    expect(d.troughN).toBe(5);
  });
  it("a losing start counts from the zero peak", () => expect(dd([-10, -5]).usd).toBe(15));
  it("no drawdown on a rising curve", () => expect(dd([5, 5]).usd).toBe(0));
  it("percentage only with a starting equity: dd / (start + peak)", () => {
    expect(dd([10, 20, -25, 10, -25]).pct).toBeNull();
    expect(dd([10, 20, -25, 10, -25], null).pct).toBeNull();
    expect(dd([10, 20, -25, 10, -25], 0).pct).toBeNull();
    expect(dd([10, 20, -25, 10, -25], 970).pct).toBeCloseTo((40 / 1000) * 100, 9);
  });
});

describe("streaks", () => {
  const s = (xs: number[]) => streaks(closedTrades(xs.map((n, i) => mk({ exit: 100 + n, exitDate: `2026-02-${String(i + 1).padStart(2, "0")}` }))));
  it("max and current", () => {
    expect(s([1, 2, 3, -1, -1, 4])).toEqual({ maxWin: 3, maxLoss: 2, current: { type: "win", length: 1 } });
    expect(s([1, -1, -2])).toMatchObject({ maxWin: 1, maxLoss: 2, current: { type: "loss", length: 2 } });
  });
  it("breakeven ends both streaks", () => {
    expect(s([1, 1, 0, 1])).toMatchObject({ maxWin: 2, current: { type: "win", length: 1 } });
    expect(s([1, 0])).toMatchObject({ current: { type: "none", length: 0 } });
  });
  it("empty", () => expect(s([])).toEqual({ maxWin: 0, maxLoss: 0, current: { type: "none", length: 0 } }));
});

describe("pair normalization, coin and month tables", () => {
  it("normalizes every legacy spelling", () => {
    for (const p of ["BTCUSDT", "btc/usdt", "BTC-USDT", "BTC_USDT", " BTC / USDT ", "BTC", "BTCUSDC", "BTCFDUSD", "BTCBUSD"]) expect(normalizeCoin(p), p).toBe("BTC");
    expect(normalizeCoin("USDT")).toBe("USDT");
    expect(normalizeCoin("")).toBe("—");
    expect(normalizeCoin(undefined)).toBe("—");
  });
  const set = [
    win(30, { pair: "BTCUSDT", exitDate: "2026-01-10" }), loss(10, { pair: "BTC/USDT", exitDate: "2026-01-20" }),
    win(5, { pair: "ETHUSDT", exitDate: "2026-02-03", fees: 1 }), mk({ pair: "ETHUSDT", exit: 100, exitDate: "2026-02-04" }),
  ];
  it("groups legacy and new spellings of one coin together", () => {
    const rows = byCoin(closedTrades(set));
    const btc = rows.find((r) => r.key === "BTC")!;
    expect(btc).toMatchObject({ trades: 2, wins: 1, losses: 1, winRate: 50, pnl: 20 });
    expect(btc.avgReturn).toBeCloseTo(10, 9);
    expect(rows.find((r) => r.key === "ETH")).toMatchObject({ trades: 2, pnl: 4 });
  });
  it("groups by exit month and reconciles with the total", () => {
    const rows = byMonth(closedTrades(set));
    expect(rows.map((r) => r.key).sort()).toEqual(["2026-01", "2026-02"]);
    expect(rows.reduce((s, r) => s + r.pnl, 0)).toBeCloseTo(computeDashboard(set).realizedPnl, 9);
    expect(byCoin(closedTrades(set)).reduce((s, r) => s + r.pnl, 0)).toBeCloseTo(computeDashboard(set).realizedPnl, 9);
  });
  it("sorts both ways with a stable tie-break, null values last", () => {
    const rows = byCoin(closedTrades(set));
    expect(sortRows(rows, "pnl", true).map((r) => r.key)).toEqual(["BTC", "ETH"]);
    expect(sortRows(rows, "pnl", false).map((r) => r.key)).toEqual(["ETH", "BTC"]);
    expect(sortRows(rows, "key", false).map((r) => r.key)).toEqual(["BTC", "ETH"]);
    const withNull = [...rows, { key: "ZZZ", trades: 1, wins: 0, losses: 0, winRate: 0, pnl: 0, avgReturn: null }];
    expect(sortRows(withNull, "avgReturn", true).at(-1)!.key).toBe("ZZZ");
    expect(sortRows(withNull, "avgReturn", false).at(-1)!.key).toBe("ZZZ");
    expect(rows.map((r) => r.key)).toEqual(byCoin(closedTrades(set)).map((r) => r.key)); // input untouched
  });
});

describe("date filter", () => {
  it("is inclusive on close date and narrows every metric", () => {
    const set = [win(10, { exitDate: "2026-01-10" }), win(20, { exitDate: "2026-02-10" }), loss(5, { exitDate: "2026-03-10" })];
    const p = computePerformance(set, { from: "2026-02-10", to: "2026-03-10" });
    expect(p.count).toBe(2);
    expect(p.netPnl).toBe(15);
    expect(computePerformance(set, { from: "2026-04-01" }).count).toBe(0);
    expect(computePerformance(set, { to: "2026-01-10" }).count).toBe(1);
  });
});

describe("read-only guarantees", () => {
  const src = readFileSync("lib/performance.ts", "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  it("imports only the Journal helpers: no Investor data, no storage, no network", () => {
    const imports = [...src.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports).toEqual(["@/lib/journal"]);
    expect(src).not.toMatch(/localStorage|sessionStorage|fetch\(|redis|investor|saveTrades|window\./i);
  });
  it("does not mutate its input", () => {
    const set = [win(10), loss(3)];
    const copy = JSON.stringify(set);
    computePerformance(set, { startingEquity: 500 });
    expect(JSON.stringify(set)).toBe(copy);
  });
  it("page and components only read the Journal and never write trades", () => {
    const files = ["app/performance/page.tsx", ...["PerformanceView", "Filters", "MetricTiles", "EquityChart", "StreakCard", "GroupTable"].map((n) => `components/performance/${n}.tsx`)];
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/saveTrades|syncJournal|\/api\/me\/journal|@\/lib\/investor|components\/investor|setItem\(\s*KEY|fetch\(/);
    }
  });
  it("starting equity is stored on this device only, under its own key", () => {
    const s = readFileSync("components/performance/PerformanceView.tsx", "utf8");
    expect(s).toContain("atlas-trading.performance.startingEquity");
    expect(s).toMatch(/localStorage\.setItem\(EQUITY_KEY/);
  });
  it("journal, exits and Journal workflows are untouched by this feature (no performance imports)", () => {
    for (const f of ["lib/journal.ts", "lib/exits.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/performance/);
  });
});

describe("access protection for /performance", () => {
  const h = vi.hoisted(() => ({ handler: null as null | ((auth: () => Promise<{ userId: string | null }>, req: unknown) => unknown) }));
  vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: (fn: typeof h.handler) => { h.handler = fn; return fn; } }));
  const run = async (path: string, userId: string | null) => {
    await import("@/proxy");
    const url = `https://www.atlastrading.app${path}`;
    return (await h.handler!(async () => ({ userId }), { url, nextUrl: new URL(url) })) as Response | undefined;
  };
  beforeEach(() => vi.resetModules());
  it("sends a signed-out visitor to sign-in and keeps the return path", async () => {
    const res = await run("/performance", null);
    expect(res!.status).toBe(307);
    const loc = new URL(res!.headers.get("location")!);
    expect(loc.pathname).toBe("/sign-in");
    expect(loc.searchParams.get("redirect_url")).toBe("/performance");
  });
  it("lets a signed-in user in and protects sub-paths too", async () => {
    expect(await run("/performance", "user_1")).toBeUndefined();
    expect((await run("/performance/x", null))!.status).toBe(307);
  });
});
