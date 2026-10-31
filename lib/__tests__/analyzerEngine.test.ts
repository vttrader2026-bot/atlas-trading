import { describe, expect, it } from "vitest";
import {
  ENGINE_CONFIG,
  analyzeCandles,
  buildTargets,
  closedCandles,
  resolveScreenshotMarket,
  validatePlan,
  visualReadOnly,
  type EngineResult,
} from "@/lib/analyzerEngine";
import { calcATR } from "@/lib/indicators";
import type { Candle } from "@/lib/marketDataTypes";
import { HOUR, build } from "./helpers/candles";

// Bullish structure (HH + HL) with a fresh bounce off the higher low:
// 100 → 120 (HH1) → 110 (HL1) → 135 (HH2) → 122 (HL2) → gentle green bounce.
const PULLBACK: [number, number][] = [
  [100, 20], // lead-in so the series is > 60 candles
  [120, 12],
  [110, 12],
  [135, 12],
  [122, 12],
  [122.2, 1],
  [122.4, 1],
  [122.6, 1],
  [122.8, 1],
];

const noExecutable = (r: EngineResult) => {
  expect(r.plan).toBeNull();
  const json = JSON.stringify(r);
  expect(json).not.toMatch(/"(entry|stopLoss|targets|riskReward)"/);
};

describe("calcATR", () => {
  it("matches a hand-computed Wilder ATR and omits points without enough history", () => {
    const c = build(100, [[110, 5]], { wick: 0 });
    expect(calcATR(c, 14)).toEqual([]);
    const long = build(100, [[130, 30]], { wick: 1 });
    const atr = calcATR(long, 14);
    expect(atr.length).toBe(long.length - 14);
    // Every candle moves ~1 plus a 2-wide wick range → TR ≈ 2 + gap; ATR must be a stable positive number.
    expect(atr[atr.length - 1].value).toBeGreaterThan(1.5);
    expect(atr[atr.length - 1].value).toBeLessThan(4);
  });
});

describe("closed candles only", () => {
  it("drops a forming candle before any calculation", () => {
    const base = build(100, PULLBACK);
    const forming: Candle = { ...base[base.length - 1], openTime: 9e9, closeTime: 9e9 + HOUR, open: 124, close: 999, high: 1000, low: 124, status: "forming" };
    expect(closedCandles([...base, forming]).length).toBe(base.length);
    const a = analyzeCandles({ candles: base, interval: "1h" });
    const b = analyzeCandles({ candles: [...base, forming], interval: "1h" });
    expect(b).toEqual(a);
    expect(b.market!.price).toBe(base[base.length - 1].close);
  });
});

describe("VALID SETUP (spot LONG pullback)", () => {
  const r = analyzeCandles({ candles: build(100, PULLBACK), interval: "1h" });

  it("is valid with no rejection reasons and a full plan", () => {
    expect(r.verdict).toBe("VALID_SETUP");
    expect(r.reasons).toEqual([]);
    expect(r.candidate).toBe("pullback");
    expect(r.plan).not.toBeNull();
    expect(r.watch).toBeNull();
  });

  it("keeps market trend and setup validity separate", () => {
    expect(r.market!.trend.direction).toBe("Bullish");
    expect(r.market!.structure.state).toBe("Bullish");
  });

  it("entry is inside the support zone, SL below the whole entry zone with an ATR buffer", () => {
    const p = r.plan!;
    const atr = r.market!.atr;
    expect(p.entry.low).toBeLessThanOrEqual(p.entry.high);
    expect(p.stopLoss).toBeLessThanOrEqual(p.entry.low - ENGINE_CONFIG.slAtrBuffer * atr + atr * 1e-6);
    expect(p.entry.high).toBe(r.market!.price);
  });

  it("targets are ascending, above the worst entry, and R:R uses the worst entry", () => {
    const p = r.plan!;
    expect(p.targets[0].price).toBeGreaterThan(p.entry.high);
    expect(p.targets[1].price).toBeGreaterThan(p.targets[0].price);
    expect(p.targets[2].price).toBeGreaterThan(p.targets[1].price);
    const risk = p.entry.high - p.stopLoss;
    expect(p.risk).toBeCloseTo(risk, 6);
    expect(p.targets[0].rr).toBeCloseTo((p.targets[0].price - p.entry.high) / risk, 2);
    expect(p.targets[0].rr).toBeGreaterThanOrEqual(ENGINE_CONFIG.minRrTp1);
    expect(p.targets[0].source).not.toBe("atr_extension"); // TP1 is always structural
  });

  it("is deterministic", () => {
    expect(analyzeCandles({ candles: build(100, PULLBACK), interval: "1h" })).toEqual(r);
  });
});

describe("WAIT FOR CONFIRMATION", () => {
  it("waits when price has run away from support (extended) and exposes no executable values", () => {
    const segs: [number, number][] = [...PULLBACK.slice(0, 5), [131, 5]];
    const r = analyzeCandles({ candles: build(100, segs), interval: "1h" });
    expect(r.verdict).toBe("WAIT_FOR_CONFIRMATION");
    expect(r.reasons).toEqual(["PRICE_EXTENDED"]);
    expect(r.watch?.role).toBe("pullback_to_support");
    noExecutable(r);
  });

  it("waits for a bullish close when price sits at support but the last candle is red", () => {
    const segs: [number, number][] = [...PULLBACK.slice(0, 5), [122.2, 1], [122.4, 1], [122.6, 1], [122.2, 1]];
    const r = analyzeCandles({ candles: build(100, segs), interval: "1h" });
    expect(r.verdict).toBe("WAIT_FOR_CONFIRMATION");
    expect(r.reasons).toEqual(["AWAIT_BULLISH_CLOSE"]);
    noExecutable(r);
  });

  it("is demoted from VALID when the higher timeframe is bearish, and the plan is dropped", () => {
    const down = build(200, [[150, 60], [160, 6], [140, 20], [150, 6], [120, 20], [130, 6], [100, 20]]);
    const r = analyzeCandles({ candles: build(100, PULLBACK), interval: "1h", higherCandles: down });
    expect(r.higherTimeframe?.direction).toBe("Bearish");
    expect(r.verdict).toBe("WAIT_FOR_CONFIRMATION");
    expect(r.reasons).toEqual(["HTF_BEARISH"]);
    noExecutable(r);
  });

  it("is demoted from VALID when RSI is overbought, and the plan is dropped", () => {
    const candles = build(100, PULLBACK);
    const valid = analyzeCandles({ candles, interval: "1h" });
    expect(valid.verdict).toBe("VALID_SETUP");
    const rsi = valid.market!.rsi14!;
    const r = analyzeCandles({ candles, interval: "1h", overboughtRsi: rsi - 1 });
    expect(r.verdict).toBe("WAIT_FOR_CONFIRMATION");
    expect(r.reasons).toEqual(["OVERBOUGHT"]);
    noExecutable(r);
  });
});

describe("NO CLEAN SETUP", () => {
  it("rejects a downtrend (bearish is never LONG)", () => {
    const r = analyzeCandles({ candles: build(200, [[150, 20], [160, 12], [140, 12], [150, 12], [120, 12], [128, 12], [100, 12]]), interval: "1h" });
    expect(r.verdict).toBe("NO_CLEAN_SETUP");
    expect(r.reasons).toEqual(["DOWNTREND"]);
    expect(r.market!.trend.direction).toBe("Bearish");
    noExecutable(r);
  });

  it("rejects a range with no edge", () => {
    const r = analyzeCandles({
      candles: build(100, [[100, 20], [110, 10], [100, 10], [110, 10], [100, 10], [110, 10], [105, 3], [105.2, 1], [105.4, 1], [105.6, 1]]),
      interval: "1h",
    });
    expect(r.verdict).toBe("NO_CLEAN_SETUP");
    expect(["RANGE_NO_EDGE", "STRUCTURE_UNCLEAR"]).toContain(r.reasons[0]);
    noExecutable(r);
  });

  it("returns INSUFFICIENT_DATA with no market reading when history is short", () => {
    const r = analyzeCandles({ candles: build(100, [[120, 30]]), interval: "1h" });
    expect(r.verdict).toBe("NO_CLEAN_SETUP");
    expect(r.reasons).toEqual(["INSUFFICIENT_DATA"]);
    expect(r.market).toBeNull();
    noExecutable(r);
  });

  it("rejects a plan with too little room to the first target (RR_TOO_LOW) instead of showing it", () => {
    // Previous high only just above the bounce: real resistance exists but R:R to TP1 is poor.
    const segs: [number, number][] = [[100, 20], [120, 12], [110, 12], [124, 12], [122, 12], [122.15, 1], [122.3, 1], [122.45, 1], [122.6, 1]];
    const r = analyzeCandles({ candles: build(100, segs), interval: "1h" });
    expect(r.verdict).toBe("NO_CLEAN_SETUP");
    expect(r.reasons).toContain("RR_TOO_LOW");
    noExecutable(r);
  });

  it("rejects a pullback when the last close has broken the last swing low", () => {
    const segs: [number, number][] = [...PULLBACK, [119.5, 2]];
    const r = analyzeCandles({ candles: build(100, segs), interval: "1h" });
    expect(r.verdict).toBe("NO_CLEAN_SETUP");
    expect(r.reasons[0]).toBe("STRUCTURE_BROKEN");
    noExecutable(r);
  });
});

describe("breakout setups", () => {
  // An old high at 125, then a base under 110 and a high-volume close through it.
  const volume = (i: number, n: number) => (i === n - 1 ? 400 : 100);
  const segs: [number, number][] = [[100, 10], [125, 12], [95, 12], [110, 12], [103, 12], [105, 4], [105.5, 1], [106, 1], [106.5, 1], [107.5, 1], [111.6, 1]];

  it("is VALID on a volume-confirmed close above the swing high", () => {
    const r = analyzeCandles({ candles: build(100, segs, { volume }), interval: "1h" });
    expect(r.candidate).toBe("breakout");
    expect(r.verdict).toBe("VALID_SETUP");
    expect(r.plan!.setup).toBe("breakout");
    expect(r.plan!.stopLoss).toBeLessThan(r.plan!.entry.low);
  });

  it("waits when the breakout close has no volume behind it", () => {
    const r = analyzeCandles({ candles: build(100, segs, { volume: () => 100 }), interval: "1h" });
    expect(r.verdict).toBe("WAIT_FOR_CONFIRMATION");
    expect(r.reasons).toEqual(["BREAKOUT_NEEDS_VOLUME"]);
    noExecutable(r);
  });
});

describe("validatePlan (rejects invalid plans with reason codes)", () => {
  const zone = { low: 100, high: 101 };
  const ok = { entry: { low: 100.5, high: 101.5 }, stopLoss: 98, targets: [106, 110, 114] };
  const ctx = { atr: 2, zone };

  it("accepts a well-formed plan", () => {
    expect(validatePlan(ok, ctx)).toEqual([]);
  });
  it("ENTRY_INVERTED", () => {
    expect(validatePlan({ ...ok, entry: { low: 102, high: 101 } }, ctx)).toContain("ENTRY_INVERTED");
  });
  it("ENTRY_NOT_IN_ZONE when the entry is not on a structural zone", () => {
    expect(validatePlan({ ...ok, entry: { low: 110, high: 111 } }, ctx)).toContain("ENTRY_NOT_IN_ZONE");
    expect(validatePlan(ok, { atr: 2, zone: null })).toContain("ENTRY_NOT_IN_ZONE");
    expect(validatePlan({ ...ok, entry: { low: 100.5, high: 105 } }, ctx)).toContain("ENTRY_NOT_IN_ZONE");
  });
  it("SL_NOT_BELOW_ZONE when the stop is at/above the entry or zone", () => {
    expect(validatePlan({ ...ok, stopLoss: 100.5 }, ctx)).toContain("SL_NOT_BELOW_ZONE");
    expect(validatePlan({ ...ok, stopLoss: 100.2 }, ctx)).toContain("SL_NOT_BELOW_ZONE");
    expect(validatePlan({ ...ok, stopLoss: 105 }, ctx)).toContain("SL_NOT_BELOW_ZONE");
  });
  it("SL_BUFFER_TOO_SMALL when the stop is below the zone but inside the ATR buffer", () => {
    // zone.low 100, entry.low 100.5, atr 2 → buffer needs stop ≤ 99.5; 99.9 is below the zone but too tight.
    expect(validatePlan({ ...ok, stopLoss: 99.9 }, ctx)).toContain("SL_BUFFER_TOO_SMALL");
  });
  it("TARGET_BELOW_ENTRY and TARGETS_NOT_ORDERED", () => {
    expect(validatePlan({ ...ok, targets: [101, 110, 114] }, ctx)).toContain("TARGET_BELOW_ENTRY");
    expect(validatePlan({ ...ok, targets: [110, 106, 114] }, ctx)).toContain("TARGETS_NOT_ORDERED");
    expect(validatePlan({ ...ok, targets: [106, 106, 114] }, ctx)).toContain("TARGETS_NOT_ORDERED");
    expect(validatePlan({ ...ok, targets: [106, 110] }, ctx)).toContain("TARGETS_NOT_ORDERED");
  });
  it("RR_TOO_LOW uses the WORST (highest) entry, not the best", () => {
    // Best-entry R:R = (104-100.5)/2.5 = 1.4 (passes) but worst-entry R:R = (104-101.5)/3.5 = 0.71 (fails).
    const p = { entry: { low: 100.5, high: 101.5 }, stopLoss: 98, targets: [104, 110, 114] };
    expect(validatePlan(p, ctx)).toContain("RR_TOO_LOW");
  });
  it("RISK_TOO_WIDE", () => {
    expect(validatePlan({ ...ok, stopLoss: 80, targets: [130, 140, 150] }, ctx)).toContain("RISK_TOO_WIDE");
  });
});

describe("buildTargets", () => {
  const z = (low: number) => ({ low, high: low + 0.5, mid: low + 0.25, touches: 2 });
  it("uses resistance zones first, fills the rest with labelled ATR extensions, never below entry", () => {
    const t = buildTargets(100, 2, [z(105), z(99)], 90)!;
    expect(t.map((x) => x.source)).toEqual(["resistance", "atr_extension", "atr_extension"]);
    expect(t[0].price).toBe(105);
    expect(t[1].price).toBe(105 + ENGINE_CONFIG.atrExtensionStep * 2);
  });
  it("returns null (no honest target room) when nothing structural sits above the entry", () => {
    expect(buildTargets(100, 2, [z(100.5)], 100.5)).toBeNull();
    expect(buildTargets(100, 2, [], 90)).toBeNull();
  });
  it("merges targets closer than the minimum spacing", () => {
    const t = buildTargets(100, 4, [z(106), z(106.5), z(112)], 130)!;
    expect(t[0].price).toBe(106);
    expect(t[1].price).toBe(112);
  });
});

describe("screenshot requirement and VISUAL READ ONLY", () => {
  it("requires a Binance USDT pair and a supported timeframe", () => {
    expect(resolveScreenshotMarket("BTC/USDT", "4H")).toEqual({ ok: true, baseAsset: "BTC", interval: "4h" });
    expect(resolveScreenshotMarket("ethusdt", "1w")).toEqual({ ok: true, baseAsset: "ETH", interval: "1w" });
    expect(resolveScreenshotMarket("auto", "4H")).toEqual({ ok: false, reasons: ["PAIR_REQUIRED"] });
    expect(resolveScreenshotMarket("BTC/USDT", "auto")).toEqual({ ok: false, reasons: ["TIMEFRAME_REQUIRED"] });
    expect(resolveScreenshotMarket("BTC/ETH", "4H")).toEqual({ ok: false, reasons: ["PAIR_NOT_USDT"] });
    expect(resolveScreenshotMarket("BTC/USDT", "2H")).toEqual({ ok: false, reasons: ["UNSUPPORTED_TIMEFRAME"] });
    expect(resolveScreenshotMarket("", "")).toEqual({ ok: false, reasons: ["PAIR_REQUIRED", "TIMEFRAME_REQUIRED"] });
  });

  it("VISUAL_READ_ONLY never carries a plan, market levels or watch levels", () => {
    const r = visualReadOnly(["PAIR_REQUIRED"]);
    expect(r.verdict).toBe("VISUAL_READ_ONLY");
    expect(r.reasons).toEqual(["PAIR_REQUIRED"]);
    expect(r.market).toBeNull();
    expect(r.watch).toBeNull();
    noExecutable(r);
  });
});
