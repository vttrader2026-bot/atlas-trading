import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const DAY_MS = 24 * 60 * 60_000;
const BASE_OPEN = 1_700_000_000_000;

/** A valid, closed daily kline array at index i, in Binance's documented shape. */
function rawKline(i: number): unknown[] {
  const openTime = BASE_OPEN + i * DAY_MS;
  return [
    openTime,
    "100.00000000",
    "110.00000000",
    "95.00000000",
    "105.00000000",
    "1234.50000000",
    openTime + DAY_MS - 1,
    "123456.70000000",
    5000,
    "600.00000000",
    "61000.00000000",
    "0",
  ];
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe("marketDataKlines", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.setSystemTime(BASE_OPEN + 10 * DAY_MS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fetches, parses, and validates a clean klines response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([rawKline(0), rawKline(1), rawKline(2)]))
    );
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    const result = await getValidatedKlines("BTCUSDT", "1d");
    expect(result.stale).toBe(false);
    expect(result.candles).toHaveLength(3);
    expect(result.candles[0].openTime).toBe(BASE_OPEN);
  });

  it("rejects an unsupported interval before making any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    // @ts-expect-error intentionally invalid interval for the test
    await expect(getValidatedKlines("BTCUSDT", "2h")).rejects.toMatchObject({
      code: "UNSUPPORTED_INTERVAL",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates INVALID_CANDLE_DATA for a response that fails integrity checks, without masking it", async () => {
    const badSecond = [...rawKline(1)];
    badSecond[0] = rawKline(2)[0]; // duplicate/out-of-order openTime
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([rawKline(0), badSecond])));
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    await expect(getValidatedKlines("BTCUSDT", "1d")).rejects.toMatchObject({
      code: "INVALID_CANDLE_DATA",
    });
  });

  it("throws MALFORMED_RESPONSE for a non-array response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ not: "an array" })));
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    await expect(getValidatedKlines("BTCUSDT", "1d")).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
    });
  });

  it("throws MALFORMED_RESPONSE for an entry that fails to parse", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([rawKline(0), ["garbage"]])));
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    await expect(getValidatedKlines("BTCUSDT", "1d")).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
    });
  });

  it("throws UPSTREAM_UNAVAILABLE on a non-OK HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    await expect(getValidatedKlines("BTCUSDT", "1d")).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
  });

  it("throws UPSTREAM_TIMEOUT when the request times out", async () => {
    const abortError = new Error("aborted");
    abortError.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    await expect(getValidatedKlines("BTCUSDT", "1d")).rejects.toMatchObject({
      code: "UPSTREAM_TIMEOUT",
    });
  });

  it("caches a symbol/interval/limit combination and does not refetch within the TTL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([rawKline(0)]));
    vi.stubGlobal("fetch", fetchMock);
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    await getValidatedKlines("BTCUSDT", "1d", 1);
    await getValidatedKlines("BTCUSDT", "1d", 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after the cache TTL expires", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([rawKline(0)]));
    vi.stubGlobal("fetch", fetchMock);
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    await getValidatedKlines("BTCUSDT", "1d", 1);
    vi.advanceTimersByTime(31_000); // past the 30s TTL
    await getValidatedKlines("BTCUSDT", "1d", 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never returns one symbol's cached candles for a different symbol (cross-asset isolation)", async () => {
    const fetchMock = vi.fn((url: string) => {
      const isEth = url.includes("symbol=ETHUSDT");
      return Promise.resolve(jsonResponse([isEth ? rawKlineWithOpen(5) : rawKline(0)]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    const btc = await getValidatedKlines("BTCUSDT", "1d", 1);
    const eth = await getValidatedKlines("ETHUSDT", "1d", 1);
    expect(btc.candles[0].openTime).toBe(BASE_OPEN);
    expect(eth.candles[0].openTime).toBe(BASE_OPEN + 5 * DAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never returns one interval's cached candles for a different interval of the same symbol", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([rawKline(0)]));
    vi.stubGlobal("fetch", fetchMock);
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    await getValidatedKlines("BTCUSDT", "1d", 1);
    await getValidatedKlines("BTCUSDT", "4h", 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to stale cached candles on an upstream outage, and marks them stale", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([rawKline(0)]))
      .mockRejectedValueOnce(new Error("Binance down"));
    vi.stubGlobal("fetch", fetchMock);
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    const fresh = await getValidatedKlines("BTCUSDT", "1d", 1);
    expect(fresh.stale).toBe(false);
    vi.advanceTimersByTime(31_000);
    const stale = await getValidatedKlines("BTCUSDT", "1d", 1);
    expect(stale.stale).toBe(true);
    expect(stale.candles[0].openTime).toBe(BASE_OPEN);
  });

  it("does NOT fall back to a stale cache when the fresh fetch fails integrity validation (never masks bad data)", async () => {
    const badSecond = [...rawKline(1)];
    badSecond[0] = rawKline(0)[0]; // duplicate timestamp -> INVALID_CANDLE_DATA
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([rawKline(0)]))
      .mockResolvedValueOnce(jsonResponse([rawKline(0), badSecond]));
    vi.stubGlobal("fetch", fetchMock);
    const { getValidatedKlines } = await import("@/lib/marketDataKlines");
    await getValidatedKlines("BTCUSDT", "1d", 1);
    vi.advanceTimersByTime(31_000);
    await expect(getValidatedKlines("BTCUSDT", "1d", 1)).rejects.toMatchObject({
      code: "INVALID_CANDLE_DATA",
    });
  });
});

function rawKlineWithOpen(i: number): unknown[] {
  const openTime = BASE_OPEN + i * DAY_MS;
  return [
    openTime,
    "100.00000000",
    "110.00000000",
    "95.00000000",
    "105.00000000",
    "1234.50000000",
    openTime + DAY_MS - 1,
    "123456.70000000",
    5000,
    "600.00000000",
    "61000.00000000",
    "0",
  ];
}
