import { describe, it, expect } from "vitest";
import { parseRawKline, validateCandles } from "@/lib/marketDataValidation";
import { Candle, MarketDataError } from "@/lib/marketDataTypes";

const DAY_MS = 24 * 60 * 60_000;
const BASE_OPEN = 1_700_000_000_000; // arbitrary fixed reference instant

/** Builds a valid closed daily candle at a given index, all fields consistent. */
function closedCandle(index: number, overrides: Partial<Candle> = {}): Candle {
  const openTime = BASE_OPEN + index * DAY_MS;
  const closeTime = openTime + DAY_MS - 1;
  return {
    openTime,
    closeTime,
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 1234.5,
    quoteVolume: 123_456.7,
    status: "closed",
    ...overrides,
  };
}

/** A real Binance kline array, as documented: [openTime, open, high, low,
 * close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, ignore] */
function rawKline(index: number, overrides: Partial<Record<number, unknown>> = {}): unknown[] {
  const openTime = BASE_OPEN + index * DAY_MS;
  const closeTime = openTime + DAY_MS - 1;
  const arr: unknown[] = [
    openTime,
    "100.00000000",
    "110.00000000",
    "95.00000000",
    "105.00000000",
    "1234.50000000",
    closeTime,
    "123456.70000000",
    5000,
    "600.00000000",
    "61000.00000000",
    "0",
  ];
  for (const [i, v] of Object.entries(overrides)) arr[Number(i)] = v;
  return arr;
}

describe("parseRawKline", () => {
  it("parses a valid, well-formed kline array", () => {
    const now = BASE_OPEN + 10 * DAY_MS;
    const candle = parseRawKline(rawKline(0), now);
    expect(candle).not.toBeNull();
    expect(candle!.open).toBe(100);
    expect(candle!.high).toBe(110);
    expect(candle!.low).toBe(95);
    expect(candle!.close).toBe(105);
    expect(candle!.volume).toBeCloseTo(1234.5);
    expect(candle!.quoteVolume).toBeCloseTo(123456.7);
    expect(candle!.openTime).toBe(BASE_OPEN);
  });

  it("preserves Binance's original openTime exactly, without recomputing it", () => {
    const weirdOpenTime = 1_699_999_999_123;
    const candle = parseRawKline(rawKline(0, { 0: weirdOpenTime }), Date.now());
    expect(candle!.openTime).toBe(weirdOpenTime);
  });

  it("marks a candle whose closeTime is in the future as forming", () => {
    const now = BASE_OPEN; // before the candle's close time
    const candle = parseRawKline(rawKline(0), now);
    expect(candle!.status).toBe("forming");
  });

  it("marks a candle whose closeTime has passed as closed", () => {
    const now = BASE_OPEN + 10 * DAY_MS;
    const candle = parseRawKline(rawKline(0), now);
    expect(candle!.status).toBe("closed");
  });

  it("rejects malformed/truncated responses (too few fields)", () => {
    const candle = parseRawKline([BASE_OPEN, "1", "2"], Date.now());
    expect(candle).toBeNull();
  });

  it("rejects a non-array entry", () => {
    expect(parseRawKline({ not: "an array" }, Date.now())).toBeNull();
    expect(parseRawKline(null, Date.now())).toBeNull();
    expect(parseRawKline("garbage", Date.now())).toBeNull();
  });

  it("rejects non-finite numeric fields (NaN/Infinity/non-numeric strings)", () => {
    expect(parseRawKline(rawKline(0, { 1: "not-a-number" }), Date.now())).toBeNull();
    expect(parseRawKline(rawKline(0, { 1: Infinity }), Date.now())).toBeNull();
    expect(parseRawKline(rawKline(0, { 1: NaN }), Date.now())).toBeNull();
  });

  it("rejects a non-finite openTime/closeTime", () => {
    expect(parseRawKline(rawKline(0, { 0: "oops" }), Date.now())).toBeNull();
    expect(parseRawKline(rawKline(0, { 6: NaN }), Date.now())).toBeNull();
  });
});

describe("validateCandles", () => {
  it("accepts a clean, chronologically-ordered, gapless series", () => {
    const candles = [closedCandle(0), closedCandle(1), closedCandle(2)];
    const result = validateCandles(candles, "1d", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(true);
  });

  it("accepts an empty series", () => {
    const result = validateCandles([], "1d", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(true);
  });

  it("accepts a series whose final candle is still forming", () => {
    const candles = [
      closedCandle(0),
      closedCandle(1),
      closedCandle(2, { closeTime: BASE_OPEN + 3 * DAY_MS + 5_000, status: "forming" }),
    ];
    const result = validateCandles(candles, "1d", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(true);
  });

  it("rejects out-of-order candles", () => {
    const candles = [closedCandle(1), closedCandle(0)];
    const result = validateCandles(candles, "1d", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(false);
    expect((result as { error: MarketDataError }).error.code).toBe("INVALID_CANDLE_DATA");
  });

  it("rejects duplicate timestamps", () => {
    const candles = [closedCandle(0), closedCandle(0)];
    const result = validateCandles(candles, "1d", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing interval (gap larger than one step)", () => {
    const candles = [closedCandle(0), closedCandle(2)]; // skips index 1
    const result = validateCandles(candles, "1d", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(false);
    expect((result as { error: MarketDataError }).error.message).toMatch(/missing interval/i);
  });

  it("rejects overlapping candles (gap smaller than one step between two closed candles)", () => {
    const candles = [closedCandle(0), closedCandle(1, { openTime: BASE_OPEN + DAY_MS - 1000 })];
    const result = validateCandles(candles, "1d", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid OHLC relationship: high below open/close/low", () => {
    const candles = [closedCandle(0, { high: 90 })]; // open=100 > high=90
    const result = validateCandles(candles, "1d", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(false);
    expect((result as { error: MarketDataError }).error.message).toMatch(/high/i);
  });

  it("rejects an invalid OHLC relationship: low above open/close/high", () => {
    const candles = [closedCandle(0, { low: 200 })]; // open=100 < low=200
    const result = validateCandles(candles, "1d", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(false);
    expect((result as { error: MarketDataError }).error.message).toMatch(/low/i);
  });

  it("rejects negative volume", () => {
    const candles = [closedCandle(0, { volume: -5 })];
    const result = validateCandles(candles, "1d", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(false);
  });

  it("rejects negative quote volume", () => {
    const candles = [closedCandle(0, { quoteVolume: -5 })];
    const result = validateCandles(candles, "1d", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(false);
  });

  it("rejects closeTime <= openTime", () => {
    const candles = [closedCandle(0, { closeTime: BASE_OPEN })];
    const result = validateCandles(candles, "1d", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(false);
  });

  it("validates correctly across different supported intervals (15m)", () => {
    const stepMs = 15 * 60_000;
    const c0: Candle = closedCandle(0, { openTime: BASE_OPEN, closeTime: BASE_OPEN + stepMs - 1 });
    const c1: Candle = closedCandle(0, { openTime: BASE_OPEN + stepMs, closeTime: BASE_OPEN + 2 * stepMs - 1 });
    const result = validateCandles([c0, c1], "15m", { symbol: "BTCUSDT" });
    expect(result.ok).toBe(true);
  });
});
