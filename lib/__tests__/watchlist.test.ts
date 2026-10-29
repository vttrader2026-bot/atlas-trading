import { describe, expect, it } from "vitest";
import {
  applyOp, normalizeSeen, normalizeState, normalizeSymbol, sortWatchRows, statusChange,
  type WatchRow, type WatchState,
} from "@/lib/watchlist";
import { WATCHLIST_LIMITS, watchlistLimit } from "@/lib/watchlistConfig";

const empty: WatchState = { items: [], seen: {} };
const row = (symbol: string, o: Partial<WatchRow> = {}): WatchRow => ({
  symbol, base: symbol.replace("USDT", ""), addedAt: 1, price: 10, change: 1, volume: 100, status: "watching", radar: null, ...o,
});

describe("normalizeSymbol", () => {
  it("accepts common spellings", () => {
    for (const s of ["btc", "BTC", "BTC/USDT", "btc-usdt", " BTCUSDT ", "BTC_usdt"]) expect(normalizeSymbol(s)).toBe("BTCUSDT");
    expect(normalizeSymbol("1inch")).toBe("1INCHUSDT");
  });
  it("rejects junk", () => {
    for (const s of ["", " ", "USDT", "BTC/ETH", "B$C", "x".repeat(40), null, undefined, 5, {}]) expect(normalizeSymbol(s as never)).toBeNull();
  });
});

describe("applyOp", () => {
  it("adds without duplicates and removes (also forgetting its seen status)", () => {
    let st = empty;
    for (const sym of ["BTC", "btcusdt", "BTC/USDT"]) {
      const r = applyOp(st, { op: "add", symbol: sym }, 10, 5);
      expect(r.ok).toBe(true);
      if (r.ok) st = r.state;
    }
    expect(st.items).toEqual([{ symbol: "BTCUSDT", addedAt: 5 }]);
    const s2 = applyOp(st, { op: "seen", seen: { BTCUSDT: "breakout" } }, 10);
    expect(s2.ok && s2.state.seen).toEqual({ BTCUSDT: "breakout" });
    const r = applyOp(s2.ok ? s2.state : st, { op: "remove", symbol: "BTCUSDT" }, 10);
    expect(r.ok && r.state).toEqual({ items: [], seen: {} });
  });
  it("enforces the limit on add and reports it instead of throwing", () => {
    let st = empty;
    for (let i = 0; i < 3; i++) { const r = applyOp(st, { op: "add", symbol: `C${i}X` }, 3); if (r.ok) st = r.state; }
    const over = applyOp(st, { op: "add", symbol: "NEWX" }, 3);
    expect(over).toEqual({ ok: false, error: "limit" });
    // an existing coin can still be "added" when full (no-op, not an error)
    expect(applyOp(st, { op: "add", symbol: "C0X" }, 3).ok).toBe(true);
  });
  it("rejects invalid symbols", () => {
    expect(applyOp(empty, { op: "add", symbol: "BTC/ETH" }, 10)).toEqual({ ok: false, error: "invalid" });
  });
  it("merge dedupes, respects the limit and counts what was dropped", () => {
    const base = applyOp(empty, { op: "add", symbol: "BTC" }, 3);
    const st = base.ok ? base.state : empty;
    const r = applyOp(st, { op: "merge", symbols: ["btc", "ETH", "ETH", "SOL", "ADA", "bad/pair"] }, 3);
    expect(r.ok && r.state.items.map((i) => i.symbol)).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
    expect(r.ok && r.dropped).toBe(1);
  });
  it("seen only keeps valid statuses of coins on the list", () => {
    const base = applyOp(empty, { op: "add", symbol: "BTC" }, 10);
    const r = applyOp(base.ok ? base.state : empty, { op: "seen", seen: { BTCUSDT: "breakout", ETHUSDT: "breakout", BTC: "nonsense" } }, 10);
    expect(r.ok && r.state.seen).toEqual({ BTCUSDT: "breakout" });
  });
});

describe("normalizeState / normalizeSeen", () => {
  it("cleans stored garbage", () => {
    expect(normalizeState(null)).toEqual(empty);
    const st = normalizeState({ items: [{ symbol: "btc", addedAt: 3 }, "ETH", { symbol: "??" }, { symbol: "BTCUSDT" }], seen: { BTCUSDT: "pullback", XRPUSDT: "pullback" } });
    expect(st.items.map((i) => i.symbol)).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(st.seen).toEqual({ BTCUSDT: "pullback" });
    expect(normalizeSeen([1, 2])).toEqual({});
  });
});

describe("limits config", () => {
  it("free 10, elite 50, from one place", () => {
    expect(WATCHLIST_LIMITS.free).toBe(10);
    expect(WATCHLIST_LIMITS.elite).toBe(50);
    expect(watchlistLimit("free")).toBe(10);
    expect(watchlistLimit("elite")).toBe(50);
    expect(watchlistLimit(undefined)).toBe(10);
  });
});

describe("sortWatchRows", () => {
  const rows = [
    row("AAAUSDT", { price: 5, change: -2, volume: 300, status: "pullback", addedAt: 1 }),
    row("BBBUSDT", { price: 50, change: 4, volume: 100, status: "breakout", addedAt: 2 }),
    row("CCCUSDT", { price: 0.5, change: 0.5, volume: 200, status: "watching", addedAt: 3 }),
  ];
  const syms = (rs: WatchRow[]) => rs.map((r) => r.base);
  it("price / change / volume / status / added in both directions", () => {
    expect(syms(sortWatchRows(rows, "price", "desc"))).toEqual(["BBB", "AAA", "CCC"]);
    expect(syms(sortWatchRows(rows, "price", "asc"))).toEqual(["CCC", "AAA", "BBB"]);
    expect(syms(sortWatchRows(rows, "change", "desc"))).toEqual(["BBB", "CCC", "AAA"]);
    expect(syms(sortWatchRows(rows, "change", "asc"))).toEqual(["AAA", "CCC", "BBB"]);
    expect(syms(sortWatchRows(rows, "volume", "desc"))).toEqual(["AAA", "CCC", "BBB"]);
    expect(syms(sortWatchRows(rows, "volume", "asc"))).toEqual(["BBB", "CCC", "AAA"]);
    expect(syms(sortWatchRows(rows, "status", "asc"))).toEqual(["BBB", "AAA", "CCC"]);
    expect(syms(sortWatchRows(rows, "status", "desc"))).toEqual(["CCC", "AAA", "BBB"]);
    expect(syms(sortWatchRows(rows, "added", "desc"))).toEqual(["CCC", "BBB", "AAA"]);
  });
  it("missing data is never treated as zero: it always goes last", () => {
    const withGap = [...rows, row("DDDUSDT", { price: null, change: null, volume: null, status: null })];
    for (const key of ["price", "change", "volume", "status"] as const)
      for (const dir of ["asc", "desc"] as const) expect(sortWatchRows(withGap, key, dir).at(-1)?.base).toBe("DDD");
  });
  it("does not mutate its input", () => {
    const copy = [...rows];
    sortWatchRows(rows, "price", "asc");
    expect(rows).toEqual(copy);
  });
});

describe("statusChange", () => {
  it("returns the new status only when it differs from the last seen one", () => {
    expect(statusChange("breakoutWatch", "breakout")).toBe("breakout");
    expect(statusChange("breakout", "breakout")).toBeNull();
    expect(statusChange(undefined, "breakout")).toBeNull(); // new coin: nothing to compare
    expect(statusChange("breakout", null)).toBeNull(); // no data yet
    expect(statusChange("garbage", "breakout")).toBeNull();
  });
});
