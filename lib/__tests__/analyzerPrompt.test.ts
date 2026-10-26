import { describe, expect, it } from "vitest";
import { buildPrompt, computeFacts } from "@/lib/analyzerPrompt";
import type { Candle } from "@/lib/marketDataTypes";

// Deterministic trending-with-pullbacks series (rising overall), 260 candles.
function series(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const base = 100 + i * 0.4 + Math.sin(i / 6) * 6;
    const open = base;
    const close = base + Math.cos(i / 4) * 1.2;
    return {
      openTime: i * 3_600_000,
      closeTime: i * 3_600_000 + 3_599_999,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 100 + (i % 17) * 5,
      quoteVolume: 1,
      status: "closed" as const,
    };
  });
}

describe("computeFacts + buildPrompt", () => {
  const primary = computeFacts("1h", series(260));
  const higher = computeFacts("4h", series(260));
  const prompt = buildPrompt({ lang: "en", pair: "TEST/USDT", primary, higher, lower: null, higherName: "4h", lowerName: null });

  it("computes real, finite facts and structure from candles", () => {
    expect(Number.isFinite(primary.lastClose)).toBe(true);
    expect(primary.ema200).not.toBeNull();
    expect(primary.structure.state).not.toBe("Unclear");
    expect(primary.support.length + primary.resistance.length).toBeGreaterThan(0);
  });

  it("states the methodology, spot-only rule and priority of structure over indicators", () => {
    expect(prompt).toMatch(/classic technical analysis and market-structure/i);
    expect(prompt).toMatch(/SPOT ONLY/);
    expect(prompt).toMatch(/Never recommend a short/i);
    expect(prompt).toMatch(/Indicators .*supporting evidence/i);
    expect(prompt).toMatch(/do NOT all have to agree/i);
    expect(prompt).toMatch(/"Long" \| "Wait — no clear setup"/);
    expect(prompt).not.toMatch(/"Long" \| "Short"/);
  });

  it("injects the exact computed numbers and labelled swings", () => {
    expect(prompt).toContain(String(Number(primary.lastClose.toFixed(6))));
    expect(prompt).toMatch(/Recent labelled swings/);
    expect(prompt).toMatch(/Support zones below price/);
    expect(prompt).toMatch(/Resistance zones above price/);
    expect(prompt).toMatch(/breakout confirmation/);
  });

  it("includes higher-timeframe context when supplied and says unavailable otherwise", () => {
    expect(prompt).toMatch(/HIGHER TIMEFRAME CONTEXT \(4h\)/);
    expect(prompt).toMatch(/LOWER TIMEFRAME CONTEXT \(unavailable\)/);
    expect(prompt).toMatch(/do not make claims about entry refinement/);
  });

  it("says 'not enough history' instead of inventing indicator values", () => {
    const short = computeFacts("1h", series(60));
    const p = buildPrompt({ lang: "en", pair: "X/USDT", primary: short, higher: null, lower: null, higherName: null, lowerName: null });
    expect(short.ema200).toBeNull();
    expect(p).toMatch(/EMA 20 \/ 50 \/ 200: [\d.]+ \/ [\d.]+ \/ not enough history/);
  });
});
