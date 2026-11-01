/* eslint-disable @typescript-eslint/no-explicit-any -- model JSON fixtures */
import { describe, expect, it } from "vitest";
import { analyzeCandles, visualReadOnly } from "@/lib/analyzerEngine";
import { applyEngineToAnalysis, fmtPrice } from "@/lib/analyzerEngineApply";
import { SHORT_OR_FUTURES, looksLikeUnverifiedPrice, sanitizeModelText, unsupportedIndicatorClaim } from "@/lib/analyzerSanitize";
import { build } from "./helpers/candles";

const V: [number, number][] = [[100, 20], [120, 12], [110, 12], [135, 12], [122, 12], [122.2, 1], [122.4, 1], [122.6, 1], [122.8, 1]];
const engine = analyzeCandles({ candles: build(100, V), interval: "1h" });
const rsi = engine.market!.rsi14!;

describe("unsupported indicators are removed", () => {
  it.each([
    "Price reacted at the 0.618 Fibonacci level.",
    "Bollinger Bands are squeezing.",
    "There is bearish RSI divergence.",
    "A golden cross just formed.",
    "Ichimoku cloud supports the move.",
    "VWAP is below price.",
  ])("drops: %s", (sentence) => {
    const doc = { observations: { confirmed: [sentence, "Higher lows are intact."], uncertain: [] } };
    sanitizeModelText(doc, engine);
    expect(doc.observations.confirmed).toEqual(["Higher lows are intact."]); // offender gone, no blank bullet left, neighbours untouched
  });

  it("keeps indicators Atlas does compute", () => {
    const doc = { m: "Price holds above the EMA 50 and EMA 200, ATR is stable and volume is flat." };
    sanitizeModelText(doc, engine);
    expect(doc.m).toContain("EMA 50");
  });
});

describe("RSI and MACD numbers must match the engine", () => {
  it("drops an invented RSI value, keeps the measured one and plain thresholds", () => {
    expect(unsupportedIndicatorClaim("RSI is at 83 and stretched.", engine)).toBe(true);
    expect(unsupportedIndicatorClaim(`RSI is ${rsi.toFixed(1)}, neutral.`, engine)).toBe(false);
    expect(unsupportedIndicatorClaim(`RSI(14) reads ${Math.round(rsi)}.`, engine)).toBe(false);
    expect(unsupportedIndicatorClaim("RSI would need to cross above 70 to look stretched.", engine)).toBe(false);
    expect(unsupportedIndicatorClaim("RSI is cooling and momentum is flat.", engine)).toBe(false);
  });
  it("drops an invented MACD value, keeps a measured one", () => {
    const h = engine.market!.macd!.histogram;
    expect(unsupportedIndicatorClaim("MACD histogram is 4.2 and rising.", engine)).toBe(true);
    expect(unsupportedIndicatorClaim(`MACD histogram is ${h.toFixed(3)}.`, engine)).toBe(false);
  });
  it("with no engine reading, any RSI number is unsupported", () => {
    expect(unsupportedIndicatorClaim("RSI is 55.", visualReadOnly(["PAIR_REQUIRED"]))).toBe(true);
  });
});

describe("unverified (VISUAL READ ONLY) text cannot introduce prices", () => {
  it("recognises price-like numbers but not counts, percentages or indicator names", () => {
    expect(looksLikeUnverifiedPrice("Price may reach $68,500 next.")).toBe(true);
    expect(looksLikeUnverifiedPrice("Support sits near 61250.5 on this chart.")).toBe(true);
    expect(looksLikeUnverifiedPrice("A close above 142 would help.")).toBe(true);
    expect(looksLikeUnverifiedPrice("Up 3.2% over 20 candles with EMA 50 rising on 1.8x volume.")).toBe(false);
  });

  it("applyEngineToAnalysis on VISUAL_READ_ONLY removes quoted prices from every field", () => {
    const parsed: any = {
      marketStructure: { state: "Bullish", explanation: "Looks constructive. Resistance at 68,500 is the key." },
      trend: { direction: "Bullish", strength: "Weak", explanation: "x" },
      momentum: "Momentum fades above 69000.",
      keyLevels: [],
      currentCondition: { label: "x", explanation: "y" },
      bullishScenario: { confirmation: "A close above $70,000 confirms.", targets: ["71000"], why: "Buyers return." },
      bearishScenario: null,
      whatToWatch: ["Watch the close.", "Watch 66,000 closely."],
      noClearSetup: null,
      invalidation: { level: "65000", explanation: "e" },
      tradePlan: { direction: "Long", entryZone: "66000", invalidation: "65000", targets: ["70000"], riskNote: "n", riskReward: "1:3" },
      observations: { confirmed: ["Visible EMA lines slope up."], uncertain: [] },
      teachMe: { structure: "s", trend: "t", keyLevels: "k", confirmation: "c", invalidation: "i" },
    };
    const out: any = applyEngineToAnalysis(parsed, visualReadOnly(["PAIR_REQUIRED"]), "en");
    const flat = JSON.stringify([out.marketStructure, out.momentum, out.bullishScenario, out.whatToWatch, out.observations]);
    expect(flat).not.toMatch(/68,500|69000|70,000|71000|66,000/);
    expect(out.observations.confirmed[0]).toContain("EMA");
    expect(out.verdict).toBe("VISUAL_READ_ONLY");
    expect(out.tradePlan.direction).toBe("Wait — no clear setup");
    expect(out.tradePlan.targets).toEqual([]);
  });
});

describe("engine-written explanations agree with the engine in every language", () => {
  const lies = (): any => ({
    marketStructure: { state: "Bearish", explanation: "Lower highs and lower lows dominate." },
    trend: { direction: "Bearish", strength: "Strong", explanation: "Clear downtrend." },
    momentum: "m",
    keyLevels: [],
    currentCondition: { label: "Crash", explanation: "Sellers are in full control." },
    bullishScenario: { confirmation: "Close above 999.", targets: [], why: "w" },
    bearishScenario: { confirmation: "Close below 1.", targets: [], why: "w" },
    whatToWatch: ["a"],
    noClearSetup: null,
    invalidation: { level: "1", explanation: "e" },
    tradePlan: { direction: "Short", entryZone: "1", invalidation: "2", targets: ["0.5"], riskNote: "n", riskReward: "9" },
    observations: { confirmed: [], uncertain: [] },
    teachMe: { structure: "s", trend: "t", keyLevels: "k", confirmation: "c", invalidation: "i" },
  });
  it.each(["en", "ar", "fr"])("%s: structure, trend, condition and confirmations come from the engine", (lang) => {
    const out: any = applyEngineToAnalysis(lies(), engine, lang);
    expect(out.marketStructure.state).toBe("Bullish");
    expect(out.marketStructure.explanation).not.toMatch(/Lower highs and lower lows dominate/);
    expect(out.currentCondition.explanation).not.toMatch(/Sellers/);
    expect(out.bullishScenario.confirmation).toContain(fmtPrice(engine.plan!.stopLoss));
    expect(out.bearishScenario.confirmation).toContain(fmtPrice(engine.market!.structure.lastSwingLow!));
    expect(out.bullishScenario.confirmation).not.toContain("999");
    expect(out.tradePlan.direction).toBe("Long"); // the model's "Short" never survives
    expect(JSON.stringify(out).toLowerCase()).not.toMatch(/"direction":"short"/);
  });
});

describe("spot-only: short / futures / leverage advice is removed", () => {
  it.each([
    "Consider a short position if support breaks.",
    "You could go short below the zone.",
    "Shorting this bounce looks attractive.",
    "On futures, a 10x leverage entry works.",
    "Perpetual funding is negative.",
    "يمكن فتح صفقة بيع على المكشوف.",
    "استخدم رافعة مالية عالية.",
    "Envisagez une vente à découvert sous le support.",
    "Utilisez du levier sur les contrats à terme.",
  ])("drops: %s", (sentence) => {
    expect(SHORT_OR_FUTURES.test(sentence)).toBe(true);
    const doc = { whatToWatch: [sentence, "Watch the close."] };
    sanitizeModelText(doc, engine);
    expect(doc.whatToWatch).toEqual(["Watch the close."]);
  });

  it.each(["A short-term bounce is possible.", "A short pullback toward support.", "Volume is short of the average.", "Spot buyers defend the zone."])(
    "keeps ordinary wording: %s",
    (sentence) => {
      expect(SHORT_OR_FUTURES.test(sentence)).toBe(false);
    }
  );

  it("the engine's own downside wording ('not a short idea') is written after sanitising and survives", () => {
    const out = applyEngineToAnalysis({ bearishScenario: { confirmation: "x", targets: [], why: "y" }, bullishScenario: { confirmation: "x", targets: [], why: "y" }, observations: { confirmed: [], uncertain: [] }, whatToWatch: ["Consider a short position."] } as any, engine, "en") as any;
    expect(JSON.stringify(out.whatToWatch)).not.toMatch(/short/i);
    expect(out.bearishScenario.confirmation).toMatch(/not a short idea/i);
  });
});
