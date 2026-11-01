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
import { RISK_NOTE, momentumText, uncertainFacts } from "@/lib/analyzerSanitize";
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

  it("also catches whole-number prices but ignores indicator settings, counts and ratios", () => {
    expect(unsupportedPrices("Price may reach 131 soon.", allowed, ref)).toEqual([131]);
    expect(unsupportedPrices("A break below 118 would hurt.", allowed, ref)).toEqual([118]);
    expect(unsupportedPrices("Price holds above the EMA 50 and the 200 EMA; RSI(14) is neutral; EMA 20/50/200 stacked.", allowed, ref)).toEqual([]);
    expect(unsupportedPrices("Over the last 20 candles, with 3 touches on the 4H chart (1h and 15M ignored).", allowed, ref)).toEqual([]);
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

  it("overrides structure/trend/key levels and their explanations from the engine (the model's contradicting text is replaced)", () => {
    expect(out.marketStructure.state).toBe("Bullish");
    expect(out.trend.direction).toBe("Bullish");
    expect(out.keyLevels.map((k: any) => k.price)).not.toContain("999");
    expect(out.keyLevels.some((k: any) => k.label === "Current Price" && k.price === fmtPrice(engine.market!.price))).toBe(true);
    expect(out.trend.explanation).not.toBe("Trend is clear.");
    expect(out.trend.explanation).toMatch(/bullish/i);
    expect(out.marketStructure.explanation).not.toMatch(/Price bounced at 118/); // model text contradicted the engine
    expect(out.marketStructure.explanation).toMatch(/higher highs and higher lows/i);
  });

  it("scrubs model sentences that quote prices the engine did not provide", () => {
    const text = JSON.stringify(out);
    expect(text).not.toContain("118.2");
    expect(text).not.toContain("171.31");
    expect(text).not.toContain("77.77");
    // "Confirmed" is engine-measured only: the model's own confirmed list is replaced, so its claim cannot appear as a fact.
    expect(out.observations.confirmed).not.toContain("Swing high 135.5 held.");
    expect(out.observations.confirmed.join(" ")).toMatch(/EMA/);
  });

  it("displays the exact engine values (no separate re-rounding)", () => {
    const p = engine.plan!;
    expect(Number(out.tradePlan.invalidation)).toBe(p.stopLoss);
    expect(out.tradePlan.targets.map(Number)).toEqual(p.targets.map((t) => t.price));
    expect(out.tradePlan.entryZone).toBe(`${p.entry.low} - ${p.entry.high}`);
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
        riskNote: RISK_NOTE.en,
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

describe("commentary is engine-owned for a verified market", () => {
  const engine = analyzeCandles({ candles: build(100, VALID_SEGS), interval: "1h" });
  const noisy = () => {
    const m = modelAnswer();
    m.momentum = "Strong bullish divergence; RSI at 91 and a golden cross confirm a 300% rally.";
    m.whatToWatch = ["Expect a squeeze to the moon.", "Buy aggressively."];
    m.bullishScenario.why = "Whales are accumulating.";
    m.bearishScenario.why = "Insiders are selling.";
    m.observations = { confirmed: ["Whales accumulate."], uncertain: ["Elon may tweet."] };
    m.tradePlan.riskNote = "Guaranteed profit.";
    m.invalidation.explanation = "Never fails.";
    return m;
  };

  it.each(["en", "ar", "fr"])("%s: none of the model's opinions reach the response", (lang) => {
    const out = applyEngineToAnalysis(noisy(), engine, lang) as any;
    const text = JSON.stringify(out.momentum) + JSON.stringify(out.whatToWatch) + JSON.stringify(out.observations) + JSON.stringify(out.bullishScenario) + JSON.stringify(out.bearishScenario) + JSON.stringify(out.tradePlan.riskNote) + JSON.stringify(out.invalidation);
    for (const bad of ["Whales", "Insiders", "moon", "Guaranteed", "divergence", "golden cross", "Elon", "Never fails", "91"]) expect(text).not.toContain(bad);
    expect(out.whatToWatch).toEqual([]);
    expect(out.momentum).toBe(momentumText(engine, lang as "en"));
    expect(out.tradePlan.riskNote).toBe(RISK_NOTE[lang as "en"]);
    expect(out.observations.uncertain).toEqual(uncertainFacts(engine, lang as "en"));
  });

  it("momentum text states only measured values", () => {
    const m = engine.market!;
    const text = momentumText(engine, "en");
    expect(text).toContain(`RSI(14) is ${m.rsi14!.toFixed(1)}`);
    expect(text).toMatch(/MACD histogram is (positive|negative)/);
  });

  it("an unverified screenshot keeps the model's image read (labelled VISUAL READ ONLY in the UI) but gets no engine-made claims", () => {
    const v = visualReadOnly(["PAIR_REQUIRED"]);
    const m = noisy();
    m.momentum = "Candles on the image look stretched upward.";
    const out = applyEngineToAnalysis(m, v, "en") as any;
    expect(out.momentum).toContain("stretched"); // image read, still sanitised for price/indicator claims
    expect(applyEngineToAnalysis(noisy(), v, "en").momentum).toBe(""); // unsupported indicator claims removed even here
    expect(out.verdict).toBe("VISUAL_READ_ONLY");
    expect(out.tradePlan.targets).toEqual([]);
  });
});
