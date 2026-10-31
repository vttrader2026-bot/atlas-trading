/* eslint-disable @typescript-eslint/no-explicit-any -- test fixtures mimic loosely-typed model JSON */
import { describe, expect, it } from "vitest";
import { analyzeCandles, visualReadOnly } from "@/lib/analyzerEngine";
import {
  REASON_TEXT,
  VERDICT_LABEL,
  allowedNumbers,
  applyEngineToAnalysis,
  engineFactsBlock,
  fmtPrice,
  scrubUnsupportedPrices,
  unsupportedPrices,
} from "@/lib/analyzerEngineApply";
import { buildPrompt, computeFacts } from "@/lib/analyzerPrompt";
import { build } from "./helpers/candles";

const VALID_SEGS: [number, number][] = [[100, 20], [120, 12], [110, 12], [135, 12], [122, 12], [122.2, 1], [122.4, 1], [122.6, 1], [122.8, 1]];
const EXTENDED_SEGS: [number, number][] = [...VALID_SEGS.slice(0, 5), [131, 5]];
const DOWN_SEGS: [number, number][] = [[150, 20], [160, 12], [140, 12], [150, 12], [120, 12], [128, 12], [100, 12]];

// What a careless model might return: invented levels everywhere.
function modelAnswer() {
  return {
    pair: "TEST/USDT",
    timeframe: "1h",
    marketStructure: { state: "Bearish", explanation: "Structure reads higher highs and higher lows. Price bounced at 118.2." },
    trend: { direction: "Bearish", strength: "Strong", explanation: "Trend is clear." },
    momentum: "RSI is cooling. MACD flat.",
    keyLevels: [{ label: "Resistance 1", price: "999" }],
    currentCondition: { label: "Breakout!!", explanation: "Buyers defend the zone. Target 171.31 looks easy." },
    bullishScenario: { confirmation: "Close above the zone.", targets: ["140", "150", "160"], why: "Momentum." },
    bearishScenario: { confirmation: "Loss of support.", targets: ["100", "90", "80"], why: "Risk." },
    whatToWatch: ["Watch the close.", "Watch 77.77 closely."],
    noClearSetup: null,
    invalidation: { level: "ENGINE", explanation: "A break would weaken the idea." },
    tradePlan: { direction: "Long", entryZone: "120-121", invalidation: "115", targets: ["130", "140", "150"], riskNote: "Not financial advice.", riskReward: "1 : 9" },
    observations: { confirmed: ["Swing high 135.5 held."], uncertain: [] },
    teachMe: { structure: "Structure is the pattern of swings.", trend: "x", keyLevels: "y", confirmation: "z", invalidation: "w" },
  } as Record<string, any>;
}

describe("price scrubbing", () => {
  const engine = analyzeCandles({ candles: build(100, VALID_SEGS), interval: "1h" });
  const allowed = allowedNumbers(engine);
  const ref = engine.market!.price;

  it("flags only price-like numbers in the coin's range that the engine did not supply", () => {
    expect(unsupportedPrices("Price bounced at 118.2 and may reach 171.31.", allowed, ref)).toEqual([118.2, 171.31]);
    expect(unsupportedPrices(`Swing high ${fmtPrice(135.5)} held.`, allowed, ref)).toEqual([]);
    expect(unsupportedPrices(`RSI ${engine.market!.rsi14!.toFixed(1)} with 1.8x volume, up 3.2% on a 1 : 2.4 ratio over 20 EMA.`, allowed, ref)).toEqual([]);
  });

  it("removes only the offending sentences", () => {
    const o = { a: "Good context. It targets 171.31 soon. Final thought.", b: ["Keep 135.5 in view.", "Dream of 171.5."] };
    const removed = scrubUnsupportedPrices(o, allowed, ref);
    expect(removed).toBe(2);
    expect(o.a).toBe("Good context. Final thought.");
    expect(o.b).toEqual(["Keep 135.5 in view.", ""]);
  });
});

describe("applyEngineToAnalysis — VALID SETUP", () => {
  const engine = analyzeCandles({ candles: build(100, VALID_SEGS), interval: "1h" });
  const out = applyEngineToAnalysis(modelAnswer(), engine, "en") as any;

  it("replaces every invented level and plan field with the engine's numbers", () => {
    const p = engine.plan!;
    expect(out.verdict).toBe("VALID_SETUP");
    expect(out.tradePlan.direction).toBe("Long");
    expect(out.tradePlan.entryZone).toBe(`${fmtPrice(p.entry.low)} - ${fmtPrice(p.entry.high)}`);
    expect(out.tradePlan.invalidation).toBe(fmtPrice(p.stopLoss));
    expect(out.tradePlan.targets).toEqual(p.targets.map((t) => fmtPrice(t.price)));
    expect(out.tradePlan.riskReward).toBe(`1 : ${p.targets[0].rr}`);
    expect(out.invalidation.level).toBe(fmtPrice(p.stopLoss));
    expect(out.bullishScenario.targets).toEqual(out.tradePlan.targets);
    expect(out.noClearSetup).toBeNull();
  });

  it("overrides structure/trend/key levels from the engine and keeps the model's explanations", () => {
    expect(out.marketStructure.state).toBe("Bullish");
    expect(out.trend.direction).toBe("Bullish");
    expect(out.keyLevels.map((k: any) => k.price)).not.toContain("999");
    expect(out.keyLevels.some((k: any) => k.label === "Current Price" && k.price === fmtPrice(engine.market!.price))).toBe(true);
    expect(out.trend.explanation).toBe("Trend is clear.");
  });

  it("scrubs model sentences that quote prices the engine did not provide", () => {
    const text = JSON.stringify(out);
    expect(text).not.toContain("118.2");
    expect(text).not.toContain("171.31");
    expect(text).not.toContain("77.77");
    expect(out.observations.confirmed[0]).toBe("Swing high 135.5 held."); // engine-supplied price survives
  });

  it("includes localized verdict metadata and the raw engine result", () => {
    expect(out.verdictLabel).toBe("Valid setup");
    expect(out._engine.verdict).toBe("VALID_SETUP");
    expect(applyEngineToAnalysis(modelAnswer(), engine, "fr").verdictLabel).toBe("Setup valide");
    expect(applyEngineToAnalysis(modelAnswer(), engine, "ar").verdictLabel).toBe(VERDICT_LABEL.VALID_SETUP.ar);
  });
});

describe("applyEngineToAnalysis — WAIT and NO CLEAN never carry executable values", () => {
  const cases = [
    ["WAIT_FOR_CONFIRMATION", build(100, EXTENDED_SEGS)],
    ["NO_CLEAN_SETUP", build(200, DOWN_SEGS)],
  ] as const;

  for (const [verdict, candles] of cases) {
    it(`${verdict}: no entry, SL, TP, R:R or scenario targets reach the response`, () => {
      const engine = analyzeCandles({ candles, interval: "1h" });
      expect(engine.verdict).toBe(verdict);
      const out = applyEngineToAnalysis(modelAnswer(), engine, "en") as any;
      expect(out.verdict).toBe(verdict);
      expect(out.tradePlan).toEqual({
        direction: "Wait — no clear setup",
        entryZone: "N/A",
        invalidation: "N/A",
        targets: [],
        riskNote: "Not financial advice.",
        riskReward: "N/A",
      });
      expect(out.invalidation.level).toBe("N/A");
      expect(out.bullishScenario.targets).toEqual([]);
      expect(out.bearishScenario.targets).toEqual([]);
      expect(out._engine.plan).toBeNull();
      expect(out.noClearSetup).toBe(engine.reasons.map((c) => REASON_TEXT[c].en).join(" "));
      // The model's invented numbers are gone everywhere.
      const visible = { ...out };
      delete visible._engine;
      const text = JSON.stringify(visible);
      for (const invented of ["999", "130", "140", "115", "1 : 9", "171.31", "77.77"]) expect(text).not.toContain(invented);
    });
  }

  it("localizes the reason text", () => {
    const engine = analyzeCandles({ candles: build(200, DOWN_SEGS), interval: "1h" });
    expect(applyEngineToAnalysis(modelAnswer(), engine, "ar").noClearSetup).toBe(REASON_TEXT.DOWNTREND.ar);
    expect(applyEngineToAnalysis(modelAnswer(), engine, "fr").noClearSetup).toBe(REASON_TEXT.DOWNTREND.fr);
  });

  it("every reason code has en/ar/fr text", () => {
    for (const [code, t] of Object.entries(REASON_TEXT)) {
      expect(t.en && t.ar && t.fr, code).toBeTruthy();
    }
  });
});

describe("applyEngineToAnalysis — VISUAL READ ONLY", () => {
  const engine = visualReadOnly(["PAIR_REQUIRED", "TIMEFRAME_REQUIRED"]);
  const out = applyEngineToAnalysis(modelAnswer(), engine, "en") as any;

  it("returns a wait plan with no executable values and says why", () => {
    expect(out.verdict).toBe("VISUAL_READ_ONLY");
    expect(out.tradePlan.direction).toBe("Wait — no clear setup");
    expect(out.tradePlan.entryZone).toBe("N/A");
    expect(out.tradePlan.targets).toEqual([]);
    expect(out.invalidation.level).toBe("N/A");
    expect(out.bullishScenario.targets).toEqual([]);
    expect(out.keyLevelsUnverified).toBe(true);
    expect(out.noClearSetup).toContain("Visual read only");
    expect(out.noClearSetup).toContain(REASON_TEXT.PAIR_REQUIRED.en);
  });
});

describe("prompt integration", () => {
  const candles = build(100, VALID_SEGS);
  const engine = analyzeCandles({ candles, interval: "1h" });
  const primary = computeFacts("1h", candles);

  it("tells the model the engine is authoritative and lists the engine plan", () => {
    const block = engineFactsBlock(engine, "TEST/USDT");
    expect(block).toMatch(/authoritative/i);
    expect(block).toMatch(/MUST NOT invent, adjust or calculate/);
    expect(block).toContain(`stop-loss ${fmtPrice(engine.plan!.stopLoss)}`);
    const prompt = buildPrompt({ lang: "en", pair: "TEST/USDT", primary, higher: null, lower: null, higherName: null, lowerName: null, engine });
    expect(prompt).toContain("ATLAS ENGINE RESULT");
    expect(prompt).toMatch(/OVERRIDES any trade-plan instruction/);
  });

  it("does not leak any plan value into a WAIT prompt, and tells the model to give none", () => {
    const w = analyzeCandles({ candles: build(100, EXTENDED_SEGS), interval: "1h" });
    const block = engineFactsBlock(w, "TEST/USDT");
    expect(block).toMatch(/NO plan yet/);
    expect(block).not.toMatch(/stop-loss \d|TP1 \d|Entry zone \d/);
    expect(engineFactsBlock(visualReadOnly(["PAIR_REQUIRED"]), "the chart")).toMatch(/NO entry, stop-loss, target/);
  });

  it("leaves the legacy prompt unchanged when no engine is passed", () => {
    const prompt = buildPrompt({ lang: "en", pair: "TEST/USDT", primary, higher: null, lower: null, higherName: null, lowerName: null });
    expect(prompt).not.toContain("ATLAS ENGINE RESULT");
  });
});
