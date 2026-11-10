// QA scenario matrix. Candles are SYNTHETIC (deterministic waypoints) shaped like the seven market
// conditions the Analyzer must handle. They are not Binance data; real-data checks live in
// analyzerEngine.live.test.ts (opt-in, needs network).
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG, analyzeCandles, type EngineResult } from "@/lib/analyzerEngine";
import { narrative } from "@/lib/analyzerSanitize";
import { applyEngineToAnalysis, fmtPrice } from "@/lib/analyzerEngineApply";
import { build } from "./helpers/candles";

type Segs = [number, number][];
const run = (segs: Segs, volume?: (i: number, n: number) => number, start = 100) =>
  analyzeCandles({ candles: build(start, segs, { volume }), interval: "1h" });

/** Invariants that must hold for EVERY result, whatever the market. */
function invariants(r: EngineResult) {
  if (r.verdict !== "VALID_SETUP") {
    expect(r.plan).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/"(entry|stopLoss|targets|riskReward|risk)"/);
    return;
  }
  const p = r.plan!;
  const atr = r.market!.atr;
  expect(p.entry.low).toBeLessThanOrEqual(p.entry.high);
  expect(p.stopLoss).toBeLessThanOrEqual(p.entry.low - ENGINE_CONFIG.slAtrBuffer * atr + atr * 1e-6);
  const [t1, t2, t3] = p.targets;
  expect(t1.price).toBeGreaterThan(p.entry.high);
  expect(t2.price).toBeGreaterThan(t1.price);
  expect(t3.price).toBeGreaterThan(t2.price);
  const risk = p.entry.high - p.stopLoss; // worst entry
  expect(p.risk).toBeCloseTo(risk, 6);
  for (const t of p.targets) expect(t.rr).toBeCloseTo((t.price - p.entry.high) / risk, 1);
  expect(t1.rr).toBeGreaterThanOrEqual(ENGINE_CONFIG.minRrTp1);
  expect(risk).toBeLessThanOrEqual(ENGINE_CONFIG.maxRiskAtr * atr + 1e-9);
  // Spot long only: no short / futures vocabulary anywhere in the engine output.
  expect(JSON.stringify(r).toLowerCase()).not.toMatch(/short|futures|leverage|perp/);
}

// Textbook shapes for the breakout-and-retest rules. SYNTHETIC: they exercise the algorithm; they are not market data.
const RETEST_BASE: Segs = [[100, 20], [118, 8], [106, 8], [119, 8], [108, 6], [128, 6]];
const breakoutVolume = (i: number) => (i >= 50 && i < 56 ? 400 : 100);
const RETEST_GOOD: Segs = [...RETEST_BASE, [120.2, 5], [121.5, 2]];

const SCENARIOS: Record<string, { segs: Segs; volume?: (i: number, n: number) => number }> = {
  strongBullTrend: { segs: [[100, 20], [120, 10], [112, 6], [140, 10], [130, 6], [165, 10], [155, 6], [190, 10]] },
  bullishPullback: { segs: [[100, 20], [120, 12], [110, 12], [135, 12], [122, 12], [122.2, 1], [122.4, 1], [122.6, 1], [122.8, 1]] },
  breakoutValid: {
    segs: [[100, 10], [125, 12], [95, 12], [110, 12], [103, 12], [105, 4], [105.5, 1], [106, 1], [106.5, 1], [107.5, 1], [111.6, 1]],
    volume: (i, n) => (i === n - 1 ? 400 : 100),
  },
  breakoutRetest: {
    segs: [[100, 20], [118, 8], [106, 8], [119, 8], [108, 6], [128, 6], [121, 6], [121.4, 1], [122, 1]],
    volume: (i) => (i >= 58 && i < 66 ? 400 : 100),
  },
  failedBreakout: { segs: [[100, 20], [118, 8], [106, 8], [119, 8], [108, 6], [128, 3], [110, 6], [104, 6]] },
  conflictingStructure: { segs: [[100, 50], [120, 5], [105, 5], [125, 5], [100, 5], [118, 5], [108, 5], [119, 5]] },
  overextendedOverbought: { segs: [[100, 20], [120, 10], [112, 6], [140, 10], [130, 6], [165, 10], [155, 6], [190, 10]] },
  steadyDowntrend: { segs: [[200, 20], [180, 10], [190, 6], [150, 10], [160, 6], [120, 10]] },
  flatRange: { segs: [[100, 20], [104, 10], [98, 10], [103, 10], [99, 10], [101, 6]] },
};

describe("scenario matrix (synthetic candles)", () => {
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    it(`${name}: invariants hold and the result is deterministic`, () => {
      const a = run(sc.segs, sc.volume);
      invariants(a);
      expect(run(sc.segs, sc.volume)).toEqual(a);
    });
  }

  it("strong bullish trend at the highs: RSI/ATR never name or cause the verdict", () => {
    const r = run(SCENARIOS.strongBullTrend.segs);
    expect(r.market!.trend.direction).toBe("Bullish");
    expect(r.reasons).not.toContain("OVERBOUGHT");
    if (r.verdict !== "VALID_SETUP") expect(r.plan).toBeNull();
  });

  it("bullish pullback to support is VALID with a structural, ordered plan", () => {
    const r = run(SCENARIOS.bullishPullback.segs);
    expect(r.verdict).toBe("VALID_SETUP");
    expect(r.plan!.setup).toBe("pullback");
  });

  it("volume-confirmed breakout is VALID; the same close without volume only WAITs", () => {
    const sc = SCENARIOS.breakoutValid;
    expect(run(sc.segs, sc.volume).verdict).toBe("VALID_SETUP");
    expect(run(sc.segs).verdict).toBe("WAIT_FOR_CONFIRMATION");
  });

  it("breakout retest: never chases price that already ran away from the zone", () => {
    const r = run(SCENARIOS.breakoutRetest.segs, SCENARIOS.breakoutRetest.volume);
    expect(r.verdict).not.toBe("VALID_SETUP"); // conservative: a retest of broken resistance is not a supported setup type
    expect(r.plan).toBeNull();
  });

  it("failed breakout (price back under the range) is rejected", () => {
    const r = run(SCENARIOS.failedBreakout.segs);
    expect(r.verdict).toBe("NO_CLEAN_SETUP");
    expect(r.reasons).toContain("STRUCTURE_BROKEN");
  });

  it("conflicting/choppy structure never produces a valid long", () => {
    const r = run(SCENARIOS.conflictingStructure.segs);
    expect(r.verdict).not.toBe("VALID_SETUP");
  });

  it("downtrend and flat range have no opportunity", () => {
    const d = run(SCENARIOS.steadyDowntrend.segs);
    expect(d.verdict).toBe("NO_CLEAN_SETUP");
    expect(d.reasons).toEqual(["DOWNTREND"]);
    const f = run(SCENARIOS.flatRange.segs);
    expect(f.verdict).toBe("NO_CLEAN_SETUP");
    expect(f.reasons).toEqual(["RANGE_NO_EDGE"]);
  });

  it("scenario wording never contradicts the price: no 'a close below X would break it' when price is already below X", () => {
    for (const [name, sc] of Object.entries(SCENARIOS)) {
      const r = run(sc.segs, sc.volume);
      const low = r.market?.structure.lastSwingLow;
      for (const lang of ["en", "ar", "fr"] as const) {
        const n = narrative(r, lang, fmtPrice);
        if (r.market && low != null && r.market.price <= low) expect(n.bearConfirm, `${name}/${lang}`).toMatch(/already|بالفعل|déjà/);
        else if (low != null) expect(n.bearConfirm, `${name}/${lang}`).not.toMatch(/already|بالفعل|déjà/);
      }
    }
  });

  describe("breakout and successful retest (LONG)", () => {
    const good = () => run(RETEST_GOOD, breakoutVolume);

    it("volume-backed breakout, pullback that touches the broken level and holds, bullish close → VALID retest", () => {
      const r = good();
      expect(r.verdict).toBe("VALID_SETUP");
      expect(r.candidate).toBe("retest");
      expect(r.plan!.setup).toBe("retest");
      invariants(r);
      // entry sits in the broken-resistance zone (swing high 119.5), stop is under it, targets above the worst entry
      expect(r.plan!.entry.low).toBeCloseTo(119.5, 6);
      expect(r.plan!.stopLoss).toBeLessThan(119.5);
      expect(r.plan!.entry.high).toBe(r.market!.price);
    });

    it("the full response pipeline handles a retest plan in every language (levels from the engine only)", () => {
      const r = good();
      for (const lang of ["en", "ar", "fr"]) {
        const out = applyEngineToAnalysis({ tradePlan: { direction: "Long", entryZone: "1-2", targets: ["9", "9", "9"] }, bullishScenario: { confirmation: "x", targets: [], why: "y" }, bearishScenario: { confirmation: "x", targets: [], why: "y" }, observations: { confirmed: [], uncertain: [] }, currentCondition: {}, marketStructure: {}, trend: {}, invalidation: {} } as never, r, lang) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        expect(out.verdict).toBe("VALID_SETUP");
        expect(out.currentCondition.label.length).toBeGreaterThan(3);
        expect(out.tradePlan.targets).toEqual(r.plan!.targets.map((t) => String(t.price)));
        expect(out.tradePlan.entryZone).toBe(`${r.plan!.entry.low} - ${r.plan!.entry.high}`);
      }
    });

    it("same retest but the last candle is not a bullish close → WAIT with the broken level as the watch level, no plan", () => {
      const r = run([...RETEST_BASE, [120.2, 5], [120.0, 2]], breakoutVolume);
      expect(r.verdict).toBe("WAIT_FOR_CONFIRMATION");
      expect(r.reasons).toEqual(["AWAIT_BULLISH_CLOSE"]);
      expect(r.watch).toEqual({ role: "retest", price: 119.5 });
      invariants(r);
    });

    it("breakout without volume is not a retest setup", () => {
      const r = run(RETEST_GOOD, () => 100);
      expect(r.candidate).not.toBe("retest");
      expect(r.verdict).not.toBe("VALID_SETUP");
      invariants(r);
    });

    it("failed breakout (price closes back below the broken level) is rejected", () => {
      const r = run([...RETEST_BASE, [116, 6]], breakoutVolume);
      expect(r.verdict).not.toBe("VALID_SETUP");
      expect(r.candidate).not.toBe("retest");
      invariants(r);
    });

    it("price that never came back to the level is extended, not a retest", () => {
      const r = run([...RETEST_BASE, [125, 5], [126, 2]], breakoutVolume);
      expect(r.verdict).not.toBe("VALID_SETUP");
      expect(r.candidate).not.toBe("retest");
      invariants(r);
    });

    it("a pullback that slices well through the level is not a hold", () => {
      const r = run([...RETEST_BASE, [116.5, 4], [121.5, 3]], breakoutVolume);
      expect(r.candidate).not.toBe("retest");
      invariants(r);
    });

    it("RSI cannot demote a retest, but a bearish higher timeframe still does (never a plan)", () => {
      const candles = build(100, RETEST_GOOD, { volume: breakoutVolume });
      const base = analyzeCandles({ candles, interval: "1h" });
      const r = analyzeCandles({ candles, interval: "1h", overboughtRsi: 1 } as never);
      expect(r.verdict).toBe(base.verdict);
      expect(r.reasons).not.toContain("OVERBOUGHT");
      const down = build(200, [[150, 60], [160, 6], [140, 20], [150, 6], [120, 20], [130, 6], [100, 20]]);
      const htf = analyzeCandles({ candles, interval: "1h", higherCandles: down });
      if (base.verdict === "VALID_SETUP") {
        expect(htf.verdict).toBe("WAIT_FOR_CONFIRMATION");
        expect(htf.plan).toBeNull();
        expect(htf.reasons).toContain("HTF_BEARISH");
      }
    });
  });

  it("random-walk sweep: 400 series, invariants never violated, a mix of verdicts occurs", () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const seen: Record<string, number> = {};
    for (let k = 0; k < 400; k++) {
      const segs: Segs = [];
      let price = 100;
      const n = 6 + Math.floor(rnd() * 6);
      for (let i = 0; i < n; i++) {
        price = Math.max(10, price * (1 + (rnd() - 0.45) * 0.3));
        segs.push([price, 6 + Math.floor(rnd() * 12)]);
      }
      const r = run(segs, (i, m) => (rnd() < 0.1 || i === m - 1 ? 300 : 100));
      invariants(r);
      seen[r.verdict] = (seen[r.verdict] ?? 0) + 1;
    }
    expect(Object.keys(seen).length).toBeGreaterThanOrEqual(2);
  });
});
