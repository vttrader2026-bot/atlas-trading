import { describe, expect, it } from "vitest";
import { DrawingEngine, type EngineHost, type EngineView } from "@/lib/chartDrawingEngine";
import { canRedo, canUndo, commit, createHistory, redo, undo, MAX_HISTORY } from "@/lib/chartHistory";
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, saveSettings, clearSettings, withAlpha, SETTINGS_STORAGE_KEY } from "@/lib/chartSettings";
import { INDICATORS, canToggle, upcomingIndicators } from "@/lib/chartIndicators";
import { formatVolume } from "@/lib/chartOhlc";
import { zoomRange, MIN_VISIBLE_BARS } from "@/lib/chartViewport";
import { logicalToTime, timeToLogical, MAX_DRAWINGS, type Drawing } from "@/lib/chartDrawings";
import { nextOpenTime, CHART_INTERVALS, SUPPORTED_INTERVALS } from "@/lib/marketDataTypes";
import { klineStreamUrl } from "@/lib/klineStream";
import { parseChartParams, applyLiveKline } from "@/lib/chartLive";
import { validateCandles } from "@/lib/marketDataValidation";
import type { Candle } from "@/lib/marketDataTypes";

// Fake linear chart: candle i at x = 10*i, price p at y = 500 - 5*p.
const times = Array.from({ length: 100 }, (_, i) => 1_000_000 + i * 3600);
const view: EngineView = {
  times: () => times,
  xOf: (t) => ((t - times[0]) / 3600) * 10,
  yOf: (p) => 500 - p * 5,
  pointAt: (x, y) => ({ logical: x / 10, price: (500 - y) / 5 }),
  candleAt: () => null,
};
function setup() {
  const log = { commits: [] as Drawing[][], live: [] as Drawing[][], sel: [] as (string | null)[], tools: [] as string[], texts: 0, notices: [] as string[] };
  const host: EngineHost = {
    onLive: (l) => log.live.push(l),
    onCommit: (l) => log.commits.push(l),
    onSelect: (id) => log.sel.push(id),
    onTool: (t) => log.tools.push(t),
    onDraft: () => {},
    onMeasure: () => {},
    onRequestText: () => { log.texts++; },
    onNotice: (c) => log.notices.push(c),
  };
  const e = new DrawingEngine(view, host);
  return { e, log };
}
const drag = (e: DrawingEngine, x1: number, y1: number, x2: number, y2: number) => {
  e.pointerDown(x1, y1);
  e.pointerMove((x1 + x2) / 2, (y1 + y2) / 2);
  e.pointerMove(x2, y2);
  e.pointerUp(x2, y2);
};

describe("drawing engine", () => {
  it("creates a trendline by drag, commits once, selects it and returns to the cursor", () => {
    const { e, log } = setup();
    e.setTool("trend");
    drag(e, 100, 300, 400, 200);
    expect(log.commits).toHaveLength(1);
    expect(log.commits[0]).toHaveLength(1);
    expect(log.commits[0][0].kind).toBe("trend");
    expect(e.getTool()).toBe("cursor");
    expect(e.getSelectedId()).toBe(log.commits[0][0].id);
  });
  it("creates a rectangle by tap, tap (touch)", () => {
    const { e, log } = setup();
    e.setTool("rect");
    e.pointerDown(100, 300, "touch"); e.pointerUp(100, 300);
    expect(log.commits).toHaveLength(0);
    e.pointerDown(300, 200, "touch"); e.pointerUp(300, 200);
    expect(log.commits).toHaveLength(1);
    expect(log.commits[0][0].kind).toBe("rect");
  });
  it("creates horizontal, vertical lines and a zone", () => {
    const { e, log } = setup();
    for (const [tool, kind] of [["hline", "hline"], ["vline", "vline"]] as const) {
      e.setTool(tool);
      e.pointerDown(200, 250); e.pointerUp(200, 250);
      expect(log.commits.at(-1)!.at(-1)!.kind).toBe(kind);
    }
    e.setTool("zone");
    drag(e, 100, 100, 100, 200);
    expect(log.commits.at(-1)!.at(-1)!.kind).toBe("zone");
  });
  it("does not record cancelled, degenerate or incomplete drawings", () => {
    const { e, log } = setup();
    e.setTool("trend");
    e.pointerDown(100, 300); e.pointerMove(200, 250);
    e.cancel();
    expect(log.commits).toHaveLength(0);
    e.setTool("rect");
    drag(e, 100, 300, 100, 300); // zero-size
    expect(log.commits).toHaveLength(0);
    expect(e.getTool()).toBe("rect"); // stays armed
  });
  it("selects, moves (one history step) and deletes", () => {
    const { e, log } = setup();
    e.setTool("hline");
    e.pointerDown(200, 250); e.pointerUp(200, 250);
    const id = log.commits[0][0].id;
    e.setDrawings(log.commits[0]);
    e.pointerDown(500, 100); e.pointerUp(500, 100); // empty space: deselect
    expect(e.getSelectedId()).toBeNull();
    expect(e.pointerDown(300, 252)).toBe(true); // hits the line
    e.pointerMove(300, 202); e.pointerMove(300, 152);
    e.pointerUp(300, 152);
    expect(log.commits).toHaveLength(2);
    const moved = log.commits[1][0] as { price: number };
    expect(moved.price).toBeCloseTo(70, 0);
    e.setDrawings(log.commits[1]);
    expect(e.getSelectedId()).toBe(id);
    expect(e.deleteSelected()).toBe(true);
    expect(log.commits.at(-1)).toHaveLength(0);
  });
  it("cursor presses on empty chart are not consumed (chart pan keeps working)", () => {
    const { e } = setup();
    expect(e.pointerDown(300, 300)).toBe(false);
  });
  it("locked mode blocks edits and deletion", () => {
    const { e, log } = setup();
    e.setTool("hline"); e.pointerDown(200, 250); e.pointerUp(200, 250);
    e.setDrawings(log.commits[0]);
    e.setLocked(true);
    e.pointerDown(300, 250); e.pointerMove(300, 150); e.pointerUp(300, 150);
    expect(log.commits).toHaveLength(1);
    expect(e.deleteSelected()).toBe(false);
  });
  it("refuses drawings beyond the session limit with a notice", () => {
    const { e, log } = setup();
    const many: Drawing[] = Array.from({ length: MAX_DRAWINGS }, (_, i) => ({ id: `d${i}`, kind: "hline", price: i + 1 }) as Drawing);
    e.setDrawings(many);
    e.setTool("hline"); e.pointerDown(200, 250); e.pointerUp(200, 250);
    expect(log.commits).toHaveLength(0);
    expect(log.notices).toContain("limit");
  });
  it("hidden drawings can't be hit", () => {
    const { e, log } = setup();
    e.setTool("hline"); e.pointerDown(200, 250); e.pointerUp(200, 250);
    e.setDrawings(log.commits[0]);
    e.setHidden(true);
    expect(e.pointerDown(300, 250)).toBe(false);
  });
});

describe("history", () => {
  it("undo/redo creation, edit and deletion with proper flags", () => {
    let h = createHistory<string[]>([]);
    expect(canUndo(h)).toBe(false);
    h = commit(h, ["a"]); h = commit(h, ["a", "b"]); h = commit(h, ["a"]);
    expect(h.present).toEqual(["a"]);
    h = undo(h); expect(h.present).toEqual(["a", "b"]);
    h = undo(h); expect(h.present).toEqual(["a"]);
    h = undo(h); expect(h.present).toEqual([]);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(true);
    h = redo(h); expect(h.present).toEqual(["a"]);
    h = commit(h, ["z"]);
    expect(canRedo(h)).toBe(false);
  });
  it("ignores no-op commits and caps its size", () => {
    const a: string[] = [];
    let h = createHistory(a);
    h = commit(h, a);
    expect(canUndo(h)).toBe(false);
    for (let i = 0; i < MAX_HISTORY + 50; i++) h = commit(h, [String(i)]);
    expect(h.past.length).toBeLessThanOrEqual(MAX_HISTORY);
  });
});

describe("coordinate conversion", () => {
  it("time <-> logical round-trips inside and beyond the loaded range", () => {
    for (const t of [times[0], times[50], times[99]]) expect(logicalToTime(times, timeToLogical(times, t))).toBeCloseTo(t, 3);
    const beyond = times[99] + 5 * 3600;
    expect(logicalToTime(times, timeToLogical(times, beyond))).toBeCloseTo(beyond, 3);
  });
  it("a drawing's time anchor maps to the same x after a timeframe-like re-sample", () => {
    const coarse = times.filter((_, i) => i % 4 === 0);
    const t = coarse[10];
    expect(logicalToTime(coarse, timeToLogical(coarse, t))).toBeCloseTo(t, 3);
  });
});

describe("settings", () => {
  it("sanitizes junk to defaults and keeps valid values", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ grid: "bogus", volume: "yes" })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ grid: "none", volume: false }).grid).toBe("none");
    expect(sanitizeSettings({ grid: "none", volume: false }).volume).toBe(false);
  });
  it("saves, loads and resets through an injected store; survives a throwing store", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    saveSettings({ ...DEFAULT_SETTINGS, grid: "none" }, store);
    expect(mem.has(SETTINGS_STORAGE_KEY)).toBe(true);
    expect(loadSettings(store).grid).toBe("none");
    clearSettings(store);
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    const bad = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, bad)).not.toThrow();
  });
  it("withAlpha only touches #rrggbb", () => {
    expect(withAlpha("#112233", "80")).toBe("#11223380");
    expect(withAlpha("rgb(1,2,3)")).toBe("rgb(1,2,3)");
  });
});

describe("indicators foundation, ohlc and viewport", () => {
  it("only EMAs are active; RSI/MACD/SMA are marked as coming later", () => {
    expect(canToggle("ema20")).toBe(true);
    for (const id of ["sma", "rsi", "macd"] as const) expect(canToggle(id)).toBe(false);
    expect(upcomingIndicators().length).toBe(3);
    expect(INDICATORS.length).toBe(6);
  });
  it("formats volume", () => {
    expect(formatVolume(1_500_000)).toMatch(/1\.5/);
  });
  it("zoom in narrows, zoom out widens, never below the minimum", () => {
    const r = { from: 0, to: 100 };
    expect(zoomRange(r, 0.7).to - zoomRange(r, 0.7).from).toBeLessThan(100);
    expect(zoomRange(r, 1 / 0.7).to - zoomRange(r, 1 / 0.7).from).toBeGreaterThan(100);
    let z = r;
    for (let i = 0; i < 40; i++) z = zoomRange(z, 0.5);
    expect(z.to - z.from).toBeGreaterThanOrEqual(MIN_VISIBLE_BARS - 1e-6);
  });
});

describe("monthly timeframe", () => {
  it("is additive: the Analyzer interval list is unchanged", () => {
    expect(SUPPORTED_INTERVALS).not.toContain("1M" as never);
    expect(CHART_INTERVALS).toContain("1M");
  });
  it("kline stream URL accepts 1M and rejects lowercase 1m only where invalid", () => {
    expect(klineStreamUrl("BTCUSDT", "1M")).toContain("@kline_1M");
    expect(() => klineStreamUrl("BTCUSDT", "1m")).toThrow(); // minute is not offered by /charts; never confused with month
  });
  it("URL parsing keeps the month spelling", () => {
    expect(parseChartParams("?symbol=ETHUSDT&tf=1M").interval).toBe("1M");
    expect(parseChartParams("?tf=4H").interval).toBe("4h");
    expect(parseChartParams("?tf=nope").interval).toBe("1h");
  });
  it("nextOpenTime is calendar-aware", () => {
    const jan = Date.UTC(2026, 0, 1);
    expect(nextOpenTime(jan, "1M")).toBe(Date.UTC(2026, 1, 1));
    expect(nextOpenTime(Date.UTC(2026, 11, 1), "1M")).toBe(Date.UTC(2027, 0, 1));
    expect(nextOpenTime(jan, "1h")).toBe(jan + 3600_000);
  });
  const mk = (t: number, closeT: number): Candle => ({ openTime: t, closeTime: closeT, open: 1, high: 2, low: 1, close: 1.5, volume: 1, quoteVolume: 1, status: "closed" });
  it("month candles of unequal length are not flagged as gaps; live append across a month works", () => {
    const m = [Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 1), Date.UTC(2026, 2, 1)];
    const candles = m.map((t, i) => mk(t, (m[i + 1] ?? Date.UTC(2026, 3, 1)) - 1));
    const res = validateCandles(candles, "1M", { symbol: "BTCUSDT" });
    expect(JSON.stringify(res)).not.toMatch(/gap/i);
    const k = { openTime: Date.UTC(2026, 3, 1), closeTime: Date.UTC(2026, 4, 1) - 1, open: 1, high: 2, low: 1, close: 1.5, volume: 1, quoteVolume: 1, closed: false };
    expect(applyLiveKline(candles, k, "1M").kind).toBe("append");
    expect(applyLiveKline(candles, { ...k, openTime: Date.UTC(2026, 4, 1) }, "1M").kind).toBe("gap");
  });
});
