import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CSV_COLUMNS,
  KEY,
  computeDashboard,
  filterAndSort,
  loadTrades,
  normalizeTrade,
  pnlPct,
  realizedPnl,
  roiPct,
  saveTrades,
  setJournalSaveListener,
  statusOf,
  tradePnl,
  tradesToCsv,
  unrealizedPnl,
  unrealizedRoiPct,
  validateTrade,
  type Trade,
} from "@/lib/journal";

const base = (o: Partial<Trade> = {}): Trade => ({
  id: "t1", date: "2026-10-01", pair: "BTCUSDT", side: "Long", entry: 100, stop: 95, target: 115, exit: null, size: 2, notes: "", ...o,
});

describe("realized / unrealized maths (spot long)", () => {
  it("closed trade: gross, fees, PnL %, ROI", () => {
    const t = base({ status: "closed", exit: 110, exitDate: "2026-10-05", invested: 200, fees: 1.5 });
    expect(realizedPnl(t)).toBeCloseTo(20 - 1.5, 10); // (110-100)*2 - fees
    expect(pnlPct(t)).toBeCloseTo(10, 10); // price move, before fees
    expect(roiPct(t)).toBeCloseTo(((20 - 1.5) / 200) * 100, 10); // after fees
  });
  it("no fees given: net equals gross; legacy tradePnl is unchanged", () => {
    const t = base({ exit: 90 }); // legacy record: no status, exit set
    expect(statusOf(t)).toBe("closed");
    expect(realizedPnl(t)).toBe(-20);
    expect(tradePnl(t)).toBe(-20);
  });
  it("invested falls back to entry * quantity when absent", () => {
    const t = base({ exit: 120 });
    expect(roiPct(t)).toBeCloseTo((40 / 200) * 100, 10);
  });
  it("open trade has no realized figures and an unrealized one only with a price", () => {
    const t = base({ status: "open", fees: 1 });
    expect(realizedPnl(t)).toBeNull();
    expect(pnlPct(t)).toBeNull();
    expect(unrealizedPnl(t, null)).toBeNull();
    expect(unrealizedPnl(t, 0)).toBeNull();
    expect(unrealizedPnl(t, 104)).toBeCloseTo(8 - 1, 10);
    expect(unrealizedRoiPct(t, 104)).toBeCloseTo(((8 - 1) / 200) * 100, 10);
    expect(unrealizedPnl(base({ exit: 110 }), 104)).toBeNull(); // closed trades have no unrealized
  });
  it("a closed status without an exit price never counts as closed; explicit open wins over a stray exit", () => {
    expect(statusOf(base({ status: "closed", exit: null }))).toBe("open");
    expect(statusOf(base({ status: "open", exit: 110 }))).toBe("open");
    expect(realizedPnl(base({ status: "open", exit: 110 }))).toBeNull();
  });
  it("legacy Short records keep their original maths", () => {
    const t = base({ side: "Short", entry: 100, stop: 105, exit: 90, size: 3 });
    expect(realizedPnl(t)).toBe(30);
    expect(pnlPct(t)).toBeCloseTo(10, 10);
  });
});

describe("validation", () => {
  const ok = base({ status: "open", tp1: 110, tp2: 120, tp3: 130, invested: 200 });
  it("a clean open trade has no issues and needs no exit", () => expect(validateTrade(ok)).toEqual([]));
  it("closing requires an exit price and a valid exit date", () => {
    const codes = (t: Trade) => validateTrade(t).map((i) => i.code);
    expect(codes({ ...ok, status: "closed", exit: null, exitDate: "2026-10-05" })).toContain("exitRequired");
    expect(codes({ ...ok, status: "closed", exit: 0, exitDate: "2026-10-05" })).toContain("exitRequired");
    expect(codes({ ...ok, status: "closed", exit: 110, exitDate: null })).toContain("exitDate");
    expect(codes({ ...ok, status: "closed", exit: 110, exitDate: "2026-09-30" })).toContain("exitBeforeEntry");
    expect(codes({ ...ok, status: "closed", exit: 110, exitDate: "2026-10-05" })).toEqual([]);
  });
  it("spot long: stop below entry, targets above entry and ascending", () => {
    const codes = (t: Trade) => validateTrade(t).map((i) => i.code);
    expect(codes({ ...ok, stop: 100 })).toContain("stop");
    expect(codes({ ...ok, stop: 101 })).toContain("stop");
    expect(codes({ ...ok, tp1: 100 })).toContain("tp");
    expect(codes({ ...ok, tp2: 90 })).toContain("tp");
    expect(codes({ ...ok, tp1: 130, tp2: 120, tp3: 125 })).toContain("tpOrder");
  });
  it("rejects missing pair, bad quantity/entry/date and negative fees", () => {
    const codes = validateTrade({ ...ok, pair: " ", size: 0, entry: 0, date: "bad", fees: -1 }).map((i) => i.code);
    for (const c of ["pair", "quantity", "entry", "date", "fees"]) expect(codes).toContain(c);
  });
});

describe("dashboard", () => {
  const trades: Trade[] = [
    base({ id: "a", status: "closed", exit: 110, exitDate: "2026-10-02", fees: 2 }), // +18
    base({ id: "b", status: "closed", exit: 96, exitDate: "2026-10-02" }), // -8
    base({ id: "c", status: "closed", exit: 100, exitDate: "2026-10-02" }), // 0
    base({ id: "d", status: "closed", exit: 105, exitDate: "2026-10-03", pair: "ETHUSDT" }), // +10
    base({ id: "e", status: "open" }),
  ];
  it("counts, win rate, realized PnL, averages, best and worst", () => {
    const d = computeDashboard(trades);
    expect(d).toMatchObject({ total: 5, open: 1, closed: 4, wins: 2, losses: 1, breakeven: 1 });
    expect(d.winRate).toBeCloseTo(50, 10);
    expect(d.realizedPnl).toBeCloseTo(18 - 8 + 0 + 10, 10);
    expect(d.avgWin).toBeCloseTo(14, 10);
    expect(d.avgLoss).toBeCloseTo(-8, 10);
    expect(d.best?.trade.id).toBe("a");
    expect(d.worst?.trade.id).toBe("b");
  });
  it("is honest with no closed trades", () => {
    const d = computeDashboard([base({ status: "open" })]);
    expect(d).toMatchObject({ total: 1, open: 1, closed: 0, winRate: null, avgWin: null, avgLoss: null, best: null, worst: null, realizedPnl: 0 });
    expect(computeDashboard([]).total).toBe(0);
  });
});

describe("history search / filter / sort", () => {
  const trades: Trade[] = [
    base({ id: "1", pair: "BTCUSDT", date: "2026-10-03", status: "closed", exit: 110, exitDate: "2026-10-04", strategy: "Breakout" }),
    base({ id: "2", pair: "ETHUSDT", date: "2026-10-01", status: "open", notes: "waiting for retest" }),
    base({ id: "3", pair: "SOLUSDT", date: "2026-10-02", status: "closed", exit: 90, exitDate: "2026-10-03", lessons: "moved stop too early" }),
  ];
  const ids = (o: Parameters<typeof filterAndSort>[1]) => filterAndSort(trades, o).map((t) => t.id);
  const d = { query: "", status: "all" as const, sort: "date" as const, desc: true };
  it("filters by status", () => {
    expect(ids({ ...d, status: "open" })).toEqual(["2"]);
    expect(ids({ ...d, status: "closed" })).toEqual(["1", "3"]);
  });
  it("searches pair, strategy, notes and lessons, case-insensitively", () => {
    expect(ids({ ...d, query: "eth" })).toEqual(["2"]);
    expect(ids({ ...d, query: "BREAKOUT" })).toEqual(["1"]);
    expect(ids({ ...d, query: "retest" })).toEqual(["2"]);
    expect(ids({ ...d, query: "stop too early" })).toEqual(["3"]);
    expect(ids({ ...d, query: "nothing like this" })).toEqual([]);
  });
  it("sorts by date, pair and PnL in both directions without mutating the input", () => {
    expect(ids(d)).toEqual(["1", "3", "2"]);
    expect(ids({ ...d, desc: false })).toEqual(["2", "3", "1"]);
    expect(ids({ ...d, sort: "pair", desc: false })).toEqual(["1", "2", "3"]);
    expect(ids({ ...d, sort: "pnl", desc: true })).toEqual(["1", "3", "2"]); // open trades sort last
    expect(trades.map((t) => t.id)).toEqual(["1", "2", "3"]);
  });
});

describe("CSV export", () => {
  it("has every relevant column and one row per trade", () => {
    const csv = tradesToCsv([base({ status: "closed", exit: 110, exitDate: "2026-10-05", tp1: 108, tp2: 115, tp3: 125, invested: 200, fees: 1.5, strategy: "Breakout", entryReason: "reclaim", notes: "n", lessons: "l", source: "plan" })]);
    const [header, row] = csv.split("\n");
    expect(header.split(",")).toEqual([...CSV_COLUMNS]);
    for (const c of ["status", "entry_date", "exit_date", "stop_loss", "tp1", "tp2", "tp3", "invested_usdt", "quantity", "fees_usdt", "realized_pnl_usdt", "pnl_pct", "roi_pct", "strategy", "entry_reason", "notes", "lessons"]) expect(header).toContain(c);
    expect(row).toContain("closed");
    expect(row).toContain("18.5"); // realized 20 - 1.5
  });
  it("leaves exit and PnL blank for open trades", () => {
    const row = tradesToCsv([base({ status: "open" })]).split("\n")[1].split(",");
    const h = [...CSV_COLUMNS];
    expect(row[h.indexOf("exit_price")]).toBe("");
    expect(row[h.indexOf("realized_pnl_usdt")]).toBe("");
  });
  it("escapes quotes/newlines and defuses spreadsheet formulas", () => {
    const csv = tradesToCsv([base({ notes: 'say "hi"\nsecond line', strategy: "=HYPERLINK(\"x\")", lessons: "-1+1" })]);
    expect(csv).toContain('"say ""hi""\nsecond line"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"'-1+1"`);
  });
  it("writes old records (no new fields) without throwing", () => {
    expect(() => tradesToCsv([base({ exit: 105 })])).not.toThrow();
  });
});

describe("migration and local storage", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } });
  });
  afterEach(() => { vi.unstubAllGlobals(); setJournalSaveListener(null); });

  const legacy = [
    { id: "old-1", date: "2025-01-05", pair: "BTCUSDT", side: "Long", entry: 40000, stop: 38000, target: 46000, exit: 44000, size: 0.05, notes: "first trade" },
    { id: "old-2", date: "2025-02-01", pair: "ETHUSDT", side: "Short", entry: 3000, stop: 3200, target: 2500, exit: null, size: 1, notes: "legacy short" },
  ];

  it("loads old records unchanged, keeping every original field", () => {
    store.set(KEY, JSON.stringify(legacy));
    const t = loadTrades();
    expect(t).toHaveLength(2);
    for (let i = 0; i < 2; i++) expect(t[i]).toMatchObject(legacy[i]);
    expect(statusOf(t[0])).toBe("closed");
    expect(statusOf(t[1])).toBe("open");
    expect(t[1].side).toBe("Short"); // not rewritten
    expect(realizedPnl(t[0])).toBeCloseTo(200, 10);
  });
  it("loading never writes, and the first save keeps a byte-exact backup of the old data", () => {
    const raw = JSON.stringify(legacy);
    store.set(KEY, raw);
    const t = loadTrades();
    expect(store.get(KEY)).toBe(raw);
    expect(store.has(`${KEY}.backup`)).toBe(false);
    saveTrades([{ ...t[0], strategy: "Breakout", fees: 2 }, t[1]]);
    expect(store.get(`${KEY}.backup`)).toBe(raw);
    saveTrades([t[0]]); // later saves do not overwrite the backup
    expect(store.get(`${KEY}.backup`)).toBe(raw);
    expect(JSON.parse(store.get(KEY) as string)).toHaveLength(1);
  });
  it("preserves unknown fields written by other versions", () => {
    store.set(KEY, JSON.stringify([{ ...legacy[0], futureField: { a: 1 } }]));
    expect((loadTrades()[0] as Record<string, unknown>).futureField).toEqual({ a: 1 });
  });
  it("gives id-less legacy records a stable id and skips non-objects without losing the rest", () => {
    const noId = { date: "2025-03-01", pair: "SOLUSDT", side: "Long", entry: 100, stop: 90, target: 120, exit: null, size: 1, notes: "" };
    store.set(KEY, JSON.stringify([noId, null, 5, "x", legacy[0]]));
    const a = loadTrades();
    expect(a.map((t) => t.pair)).toEqual(["SOLUSDT", "BTCUSDT"]);
    expect(loadTrades()[0].id).toBe(a[0].id);
    expect(normalizeTrade({ ...noId, entry: "61,000.5", size: "2" })).toMatchObject({ entry: 61000.5, size: 2 });
  });
  it("keeps a copy of unreadable data instead of silently overwriting it", () => {
    store.set(KEY, "{not json");
    expect(loadTrades()).toEqual([]);
    expect([...store.keys()].some((k) => k.startsWith(`${KEY}.corrupt-`))).toBe(true);
    expect([...store.values()]).toContain("{not json");
  });
  it("saveTrades notifies the sync listener with the saved list", () => {
    const seen: number[] = [];
    setJournalSaveListener((t) => seen.push(t.length));
    saveTrades([legacy[0] as Trade]);
    expect(seen).toEqual([1]);
  });
});
