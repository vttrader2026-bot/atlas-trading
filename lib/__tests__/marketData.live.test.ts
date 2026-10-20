// Live Binance verification — makes REAL network requests. Not run as part
// of `npm test` / routine CI (see vitest.live.config.mts); run explicitly
// with `npm run test:live` from an environment that can reach
// data-api.binance.vision (this sandbox cannot — its egress is restricted
// to package registries and GitHub, so this file has NOT been executed as
// part of this change; only the mocked suites above have run).
//
// This compares our validated service's output against a raw, independent
// fetch of the same official endpoint/symbol/interval, so a real mismatch
// (not just an internal self-consistency check) would be caught.
import { describe, it, expect } from "vitest";
import { getCandles, getExchangeInfo } from "@/lib/marketData";

const BASE = "https://data-api.binance.vision/api/v3";

describe("live: Binance Spot verification", () => {
  it("getExchangeInfo's BTCUSDT entry matches a raw exchangeInfo fetch", async () => {
    const res = await fetch(`${BASE}/exchangeInfo?symbol=BTCUSDT`);
    expect(res.ok).toBe(true);
    const raw = await res.json();
    const rawSymbol = raw.symbols?.[0];
    expect(rawSymbol?.symbol).toBe("BTCUSDT");
    expect(rawSymbol?.status).toBe("TRADING");

    const info = await getExchangeInfo();
    const pair = info.bySymbol.get("BTCUSDT");
    expect(pair).toBeDefined();
    expect(pair?.baseAsset).toBe(rawSymbol.baseAsset);
    expect(pair?.quoteAsset).toBe(rawSymbol.quoteAsset);
  });

  it("getCandles(BTC, 1d) candle opens/closes match a raw klines fetch for the same window", async () => {
    const res = await fetch(`${BASE}/klines?symbol=BTCUSDT&interval=1d&limit=10`);
    expect(res.ok).toBe(true);
    const rawKlines = (await res.json()) as unknown[][];
    expect(rawKlines.length).toBeGreaterThan(0);

    const { candles } = await getCandles("BTC", "1d", { limit: 10 });
    expect(candles.length).toBe(rawKlines.length);

    for (let i = 0; i < candles.length; i++) {
      expect(candles[i].openTime).toBe(Number(rawKlines[i][0]));
      expect(candles[i].open).toBeCloseTo(parseFloat(String(rawKlines[i][1])));
      expect(candles[i].high).toBeCloseTo(parseFloat(String(rawKlines[i][2])));
      expect(candles[i].low).toBeCloseTo(parseFloat(String(rawKlines[i][3])));
      expect(candles[i].close).toBeCloseTo(parseFloat(String(rawKlines[i][4])));
    }
  });

  it("rejects a known-unsupported pair against the real exchange (e.g. a nonsense base asset)", async () => {
    const { tryValidatePair } = await import("@/lib/marketData");
    const result = await tryValidatePair("THISISNOTARE4LCOIN", "USDT");
    expect(result).toBeNull();
  });
});
