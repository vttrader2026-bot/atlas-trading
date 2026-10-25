import { describe, expect, it } from "vitest";
import { calcEMA, calcRSI, calcMACD, latest } from "@/lib/indicators";
import type { Candle } from "@/lib/marketDataTypes";

function makeCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    openTime: i * 60_000,
    closeTime: i * 60_000 + 59_999,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    quoteVolume: close,
    status: "closed" as const,
  }));
}

describe("calcEMA", () => {
  it("returns no points when there isn't enough history", () => {
    expect(calcEMA(makeCandles([1, 2, 3]), 5)).toEqual([]);
  });

  it("seeds with an SMA and matches a hand-computed EMA for a simple series", () => {
    // closes 1..10, period 5. SMA(1..5) = 3. k = 2/6.
    const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const ema = calcEMA(candles, 5);
    expect(ema).toHaveLength(6); // indices 4..9
    expect(ema[0].value).toBeCloseTo(3, 6);
    const k = 2 / 6;
    const expected2 = 6 * k + 3 * (1 - k);
    expect(ema[1].value).toBeCloseTo(expected2, 6);
  });

  it("never fabricates values below the required period", () => {
    const candles = makeCandles(Array.from({ length: 199 }, (_, i) => 100 + i));
    expect(calcEMA(candles, 200)).toEqual([]);
  });
});

describe("calcRSI", () => {
  it("returns no points when there isn't enough history", () => {
    expect(calcRSI(makeCandles([1, 2, 3]), 14)).toEqual([]);
  });

  it("returns 100 for a strictly increasing series (no losses)", () => {
    const candles = makeCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    const rsi = calcRSI(candles, 14);
    expect(rsi.length).toBeGreaterThan(0);
    for (const p of rsi) expect(p.value).toBe(100);
  });

  it("returns 0 for a strictly decreasing series (no gains)", () => {
    const candles = makeCandles(Array.from({ length: 20 }, (_, i) => 200 - i));
    const rsi = calcRSI(candles, 14);
    expect(rsi.length).toBeGreaterThan(0);
    for (const p of rsi) expect(p.value).toBe(0);
  });

  it("stays within [0, 100] for a mixed series", () => {
    const closes = [10, 11, 9, 12, 8, 13, 7, 14, 6, 15, 5, 16, 4, 17, 3, 18, 2, 19, 1, 20];
    const rsi = calcRSI(makeCandles(closes), 14);
    for (const p of rsi) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });
});

describe("calcMACD", () => {
  it("returns empty series when there isn't enough history", () => {
    const candles = makeCandles(Array.from({ length: 10 }, (_, i) => 100 + i));
    const { macd, signal, histogram } = calcMACD(candles);
    expect(macd).toEqual([]);
    expect(signal).toEqual([]);
    expect(histogram).toEqual([]);
  });

  it("produces aligned macd/signal/histogram series with real history", () => {
    const candles = makeCandles(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 10 + i * 0.2));
    const { macd, signal, histogram } = calcMACD(candles);
    expect(macd.length).toBeGreaterThan(0);
    expect(signal.length).toBeGreaterThan(0);
    expect(histogram.length).toBeGreaterThan(0);
    // histogram = macd - signal at every point it exists for
    const macdByTime = new Map(macd.map((p) => [p.time, p.value]));
    const signalByTime = new Map(signal.map((p) => [p.time, p.value]));
    for (const h of histogram) {
      const m = macdByTime.get(h.time)!;
      const s = signalByTime.get(h.time)!;
      expect(h.value).toBeCloseTo(m - s, 6);
    }
  });
});

describe("latest", () => {
  it("returns null for an empty series, never a fabricated 0", () => {
    expect(latest([])).toBeNull();
  });

  it("returns the final point's value", () => {
    expect(latest([{ time: 1, value: 5 }, { time: 2, value: 9 }])).toBe(9);
  });
});
