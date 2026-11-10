import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ENGINE_CONFIG,
  analyzeCandles,
  chooseScreenshotMarket,
  closedCandles,
  findRetest,
  readMarket,
  normalizeDetectedMarket,
  resolveScreenshotMarket,
  rsiIsBreakoutSpike,
} from "@/lib/analyzerEngine";
import { BREAKOUT_CONFIRM_WINDOW, breakoutBarAt, recentBreakout, volumeReport } from "@/lib/chartStructure";
import { pairsFromSymbols, QUICK_PAIRS, searchPairs, symbolToPair } from "@/lib/pairList";
import { calcRSI } from "@/lib/indicators";
import { validateCandles } from "@/lib/marketDataValidation";
import { build } from "./helpers/candles";

const segs: [number, number][] = [[100, 10], [125, 12], [95, 12], [110, 12], [103, 12], [105, 4], [105.5, 1], [106, 1], [106.5, 1], [107.5, 1], [111.6, 1]];
const spikeAt = (idx: (n: number) => number) => (i: number, n: number) => (i === idx(n) ? 400 : 100);

describe("pair list (Part A)", () => {
  const symbols = new Set(["BTCUSDT", "ETHUSDT", "QNTUSDT", "INITUSDT", "1000SATSUSDT", "ETHBTC", "USDT"]);
  it("builds the list from cached Binance symbols — QNT and INIT included, non-USDT excluded", () => {
    const pairs = pairsFromSymbols(symbols);
    expect(pairs).toContain("QNT/USDT");
    expect(pairs).toContain("INIT/USDT");
    expect(pairs).toContain("1000SATS/USDT");
    expect(pairs).not.toContain("ETH/BTC");
    expect(pairs.some((p) => p.startsWith("USDT"))).toBe(false);
    expect(pairsFromSymbols(null)).toEqual([]);
  });
  it("searches by base asset, prefix first", () => {
    const pairs = pairsFromSymbols(symbols);
    expect(searchPairs(pairs, "qnt")).toEqual(["QNT/USDT"]);
    expect(searchPairs(pairs, "QNTUSDT")).toEqual(["QNT/USDT"]);
    expect(searchPairs(pairs, "nit")[0]).toBe("INIT/USDT");
    expect(searchPairs(pairs, "zzz")).toEqual([]);
  });
  it("keeps BTC, ETH, SOL, BNB, XRP as quick picks", () => {
    expect([...QUICK_PAIRS]).toEqual(["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"]);
  });
  it("QNTUSDT normalizes identically for manual and detected input", () => {
    expect(symbolToPair("QNTUSDT")).toBe("QNT/USDT");
    for (const p of ["QNT/USDT", "QNTUSDT", "qnt-usdt"]) {
      const r = resolveScreenshotMarket(p, "1H");
      expect(r).toMatchObject({ ok: true, baseAsset: "QNT", interval: "1h" });
    }
    expect(normalizeDetectedMarket("BINANCE:QNTUSDT", "60").pair).toBe("QNT/USDT");
  });
  it("selector UI is searchable and no longer hardcodes five pairs", () => {
    const page = readFileSync("app/analyzer/page.tsx", "utf8");
    expect(page).not.toMatch(/const PAIRS\s*=/);
    expect(page).toContain("PairPicker");
    expect(readFileSync("components/analyzer/PairPicker.tsx", "utf8")).toContain("getSpotTradingSymbols");
  });
});

describe("Auto-detect validation (Part A)", () => {
  it("accepts a clearly detected USDT pair and supported timeframe", () => {
    expect(normalizeDetectedMarket("INIT/USDT", "1H")).toEqual({ pair: "INIT/USDT", timeframe: "1h" });
    expect(normalizeDetectedMarket("BTCUSDT", "D")).toEqual({ pair: "BTC/USDT", timeframe: "1d" });
    expect(normalizeDetectedMarket("ETH/USDT", "240")).toEqual({ pair: "ETH/USDT", timeframe: "4h" });
  });
  it("treats Unclear / perps / cross pairs / odd timeframes as undetected", () => {
    expect(normalizeDetectedMarket("Unclear", "Unclear")).toEqual({ pair: null, timeframe: null });
    expect(normalizeDetectedMarket("ETH/BTC", "1H").pair).toBeNull();
    expect(normalizeDetectedMarket("BTCUSDT.P", "1H").pair).toBeNull();
    expect(normalizeDetectedMarket("BTC/USDT", "3M").timeframe).toBeNull();
    expect(normalizeDetectedMarket(undefined, 5)).toEqual({ pair: null, timeframe: null });
  });
  it("detected values fill only what the user left on Auto", () => {
    const d = { pair: "INIT/USDT", timeframe: "1h" };
    expect(chooseScreenshotMarket({ pair: "auto", timeframe: "auto" }, d)).toMatchObject({ pair: "INIT/USDT", timeframe: "1h", pairDetected: true, timeframeDetected: true });
    expect(chooseScreenshotMarket({ pair: "", timeframe: undefined }, d).pair).toBe("INIT/USDT");
  });
  it("manual selections always override AI detection (including QNTUSDT)", () => {
    const d = { pair: "BTC/USDT", timeframe: "4h" };
    const r = chooseScreenshotMarket({ pair: "QNT/USDT", timeframe: "1H" }, d);
    expect(r).toMatchObject({ pair: "QNT/USDT", timeframe: "1H", pairDetected: false, timeframeDetected: false });
    expect(chooseScreenshotMarket({ pair: "QNT/USDT", timeframe: "auto" }, d)).toMatchObject({ pair: "QNT/USDT", timeframe: "4h" });
    expect(chooseScreenshotMarket({ pair: "auto", timeframe: "1D" }, d)).toMatchObject({ pair: "BTC/USDT", timeframe: "1D" });
  });
  it("uncertain detection leaves pair/timeframe empty so the engine asks the user to choose", () => {
    const chosen = chooseScreenshotMarket({ pair: "auto", timeframe: "auto" }, normalizeDetectedMarket("Unclear", "Unclear"));
    const r = resolveScreenshotMarket(chosen.pair, chosen.timeframe);
    expect(r).toEqual({ ok: false, reasons: ["PAIR_REQUIRED", "TIMEFRAME_REQUIRED"] });
  });
  it("prompt no longer invites the model to guess a pair", () => {
    const route = readFileSync("app/api/analyze/route.ts", "utf8");
    expect(route).not.toContain("best guess");
    expect(route).toContain("Never guess a pair");
  });
});

describe("invalid candle data (validation unchanged)", () => {
  it("rejects a gap larger than one interval", () => {
    const c = build(100, [[120, 80]]);
    c.splice(40, 3);
    const r = validateCandles(c, "1h", { symbol: "QNTUSDT" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_CANDLE_DATA");
  });
  it("engine still rejects insane candles", () => {
    const c = build(100, [[120, 80]]);
    c[30] = { ...c[30], high: c[30].low - 1 };
    expect(analyzeCandles({ candles: c, interval: "1h" }).reasons).toEqual(["INVALID_DATA"]);
  });
});

describe("shared breakout definition and confirmation window (Part B)", () => {
  it("thresholds are unchanged", () => {
    expect(ENGINE_CONFIG.breakoutVolumeMult).toBe(1.5);
    expect(ENGINE_CONFIG.overboughtRsi).toBe(75);
    expect(ENGINE_CONFIG.maxRiskAtr).toBe(6);
    expect(BREAKOUT_CONFIRM_WINDOW).toBe(3);
  });
  it("volume-confirmed breakout on the latest candle is VALID (as before)", () => {
    const r = analyzeCandles({ candles: build(100, segs, { volume: spikeAt((n) => n - 1) }), interval: "1h" });
    expect(r.verdict).toBe("VALID_SETUP");
  });
  it("remembers the breakout-volume candle one bar later instead of checking only the latest candle", () => {
    const candles = build(100, [...segs, [112, 1]], { volume: spikeAt((n) => n - 2) });
    const closed = candles;
    expect(recentBreakout(closed)?.barsAgo).toBe(1);
    expect(volumeReport(closed).breakoutConfirmation).toBe("high-close-on-high-volume");
    const r = analyzeCandles({ candles, interval: "1h" });
    expect(r.reasons).not.toContain("BREAKOUT_NEEDS_VOLUME");
    expect(r.candidate).toBe("breakout");
  });
  it("the memory expires after the window", () => {
    const candles = build(100, [...segs, [112, 1], [112.2, 1], [112.4, 1]], { volume: spikeAt((n) => n - 4) });
    expect(recentBreakout(candles)).toBeNull();
    const r = analyzeCandles({ candles, interval: "1h" });
    expect(r.verdict).not.toBe("VALID_SETUP");
  });
  it("is forgotten when price closed back under the breakout level (confirmation genuinely failed)", () => {
    const candles = build(100, [...segs, [105, 1]], { volume: spikeAt((n) => n - 2) });
    expect(recentBreakout(candles)).toBeNull();
    const r = analyzeCandles({ candles, interval: "1h" });
    expect(r.verdict).not.toBe("VALID_SETUP");
  });
  it("without any volume spike there is still no confirmation", () => {
    const r = analyzeCandles({ candles: build(100, [...segs, [112, 1]], { volume: () => 100 }), interval: "1h" });
    expect(r.reasons).toEqual(["BREAKOUT_NEEDS_VOLUME"]);
  });
  it("breakoutBarAt requires a new 20-candle high close, a bullish body and 1.5x volume", () => {
    const c = build(100, segs, { volume: spikeAt((n) => n - 1) });
    const i = c.length - 1;
    expect(breakoutBarAt(c, i)).not.toBeNull();
    expect(breakoutBarAt(c.map((x, k) => (k === i ? { ...x, volume: 140 } : x)), i)).toBeNull(); // 1.4x
    expect(breakoutBarAt(c, 5)).toBeNull(); // not enough history
  });
});

describe("RSI in breakout context (Part B)", () => {
  it("a brief RSI spike caused by the breakout candle does not discard the setup", () => {
    const candles = build(100, segs, { volume: spikeAt((n) => n - 1) });
    const rsi = analyzeCandles({ candles, interval: "1h" }).market!.rsi14!;
    // Put the overbought level just under the current RSI: the old rule would demote, the context rule must not.
    const r = analyzeCandles({ candles, interval: "1h", overboughtRsi: rsi - 1 });
    const closed = candles;
    expect(rsiIsBreakoutSpike(closed, closed.length - 1, rsi - 1)).toBe(true);
    expect(r.verdict).toBe("VALID_SETUP");
  });
  it("pullback setups keep the strict RSI rule", () => {
    const PULL: [number, number][] = [[100, 20], [120, 12], [110, 12], [135, 12], [122, 12], [122.2, 1], [122.4, 1], [122.6, 1], [122.8, 1]];
    const candles = build(100, PULL);
    const rsi = analyzeCandles({ candles, interval: "1h" }).market!.rsi14!;
    const r = analyzeCandles({ candles, interval: "1h", overboughtRsi: rsi - 1 });
    expect(r.reasons).toEqual(["OVERBOUGHT"]);
  });
  it("RSI already overbought BEFORE the breakout is not a spike", () => {
    const candles = build(100, [[200, 80]], { volume: () => 100 });
    const series = calcRSI(candles, 14);
    expect(series[series.length - 1].value).toBeGreaterThan(75);
    expect(rsiIsBreakoutSpike(candles, candles.length - 1, 75)).toBe(false);
  });
  it("sustained overbought after the breakout (3+ closes at/above the level) is not a spike", () => {
    const base = build(100, segs, { volume: spikeAt((n) => n - 1) });
    const series = calcRSI(base, 14);
    const level = series[series.length - 1].value - 1;
    // Fabricate the same RSI-level reading persisting: breakoutIndex far enough back that the run is >= 3.
    const idx = base.length - 1;
    expect(rsiIsBreakoutSpike(base, idx, level)).toBe(true);
    const ext = build(100, [...segs, [113, 1], [114, 1], [115, 1]], { volume: spikeAt((n) => n - 4) });
    const s2 = calcRSI(ext, 14);
    const lvl = Math.min(...s2.slice(-3).map((p) => p.value)) - 0.5;
    expect(rsiIsBreakoutSpike(ext, ext.length - 4, lvl)).toBe(false);
  });
});

describe("retest evaluates later breakout candles (Part B)", () => {
  it("uses the shared breakout definition and keeps scanning past a failed first breakout", () => {
    const src = readFileSync("lib/analyzerEngine.ts", "utf8");
    expect(src).toContain("breakoutBarAt(closed, b)");
    expect(src).not.toMatch(/closed\.slice\(.*\)\.find\(/);
    expect(typeof findRetest).toBe("function");
  });
  it("a later qualifying breakout is evaluated after an earlier one that failed back into the zone", () => {
    // Bar 61 crosses the 110.5 zone on volume, then price falls back inside (failed). Bar 69 crosses again on volume and holds.
    const candles = build(
      100,
      [[100, 10], [125, 12], [95, 12], [110, 12], [103, 12], [104, 3], [111.4, 1], [104, 3], [105, 4], [113, 1], [114, 1], [115, 1], [113, 1], [112, 1], [111.3, 1], [112, 1]],
      { volume: (i) => (i === 61 || i === 69 ? 400 : 100) }
    );
    expect(breakoutBarAt(candles, 61)).not.toBeNull();
    expect(breakoutBarAt(candles, 69)).not.toBeNull();
    const rt = findRetest(readMarket(closedCandles(candles))!);
    expect(rt).toMatchObject({ confirmed: true, breakoutIndex: 69 });
    expect(rt!.zone.high).toBe(110.5);
    const r = analyzeCandles({ candles, interval: "1h" });
    expect(r.candidate).toBe("retest");
    expect(r.verdict).toBe("VALID_SETUP");
  });
  it("a plain breakout → hold → retest is VALID with the breakout on volume", () => {
    const candles = build(100, [[100, 10], [125, 12], [95, 12], [110, 12], [103, 12], [105, 4], [113, 1], [114, 1], [115, 1], [113, 1], [112, 1], [111.3, 1], [112, 1]], { volume: (i) => (i === 62 ? 400 : 100) });
    const r = analyzeCandles({ candles, interval: "1h" });
    expect(r.candidate).toBe("retest");
    expect(r.verdict).toBe("VALID_SETUP");
  });
  it("a retest whose breakout lacked volume is not accepted", () => {
    const candles = build(100, [[100, 10], [125, 12], [95, 12], [110, 12], [103, 12], [105, 4], [113, 1], [114, 1], [115, 1], [113, 1], [112, 1], [111.3, 1], [112, 1]], { volume: () => 100 });
    expect(findRetest(readMarket(closedCandles(candles))!)).toBeNull();
  });
  it("a retest that slices through the zone is not a hold", () => {
    const candles = build(100, [[100, 10], [125, 12], [95, 12], [110, 12], [103, 12], [105, 4], [113, 1], [114, 1], [115, 1], [113, 1], [111, 1], [109.5, 1], [112, 1]], { volume: (i) => (i === 62 ? 400 : 100) });
    const r = analyzeCandles({ candles, interval: "1h" });
    expect(r.candidate === "retest" && r.verdict === "VALID_SETUP").toBe(false);
  });
});

describe("Swings section removed (Part C)", () => {
  it("StructureMap has no swing map, legend or chips", () => {
    const src = readFileSync("components/analyzer/StructureMap.tsx", "utf8");
    expect(src).not.toMatch(/labelled|<svg|polyline|noSwings|structure\.legend/);
  });
  it("no 'Swings, oldest to newest' text remains in any language", () => {
    const i18n = readFileSync("lib/i18n.tsx", "utf8");
    expect(i18n).not.toContain("Swings, oldest to newest");
    expect(i18n).not.toContain("Swings, du plus ancien");
    expect(i18n).not.toContain("legend:");
  });
  it("PDF export has no swing section", () => {
    const pdf = readFileSync("lib/analysisPdf.ts", "utf8");
    expect(pdf).not.toMatch(/[Ss]wing/);
  });
});

describe("distinct error codes are logged, not shown (Part A)", () => {
  it("engine server logs each MarketDataError code and shows only a friendly reason", () => {
    const src = readFileSync("lib/analyzerEngineServer.ts", "utf8");
    expect(src).toContain("[${main.reason.code}]");
    const chart = readFileSync("app/api/analyze-chart/route.ts", "utf8");
    expect(chart).toContain("[${err.code}]");
    expect(chart).not.toMatch(/error: err\.code|message: err\.message/);
  });
});
