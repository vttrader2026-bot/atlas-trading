import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// getRedis() reads Upstash env vars; none are set in the test environment,
// so every test below naturally exercises the in-memory cache fallback path
// (the same code path used in local dev without Redis configured).
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

function exchangeInfoResponse(
  symbols: Array<{ symbol: string; baseAsset: string; quoteAsset: string; status?: string; isSpotTradingAllowed?: boolean }>
) {
  return {
    symbols: symbols.map((s) => ({
      status: "TRADING",
      isSpotTradingAllowed: true,
      ...s,
    })),
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("marketDataExchange", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and exposes only TRADING, spot-tradable symbols", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          exchangeInfoResponse([
            { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" },
            { symbol: "DEADUSDT", baseAsset: "DEAD", quoteAsset: "USDT", status: "BREAK" },
            { symbol: "NOSELLUSDT", baseAsset: "NOSELL", quoteAsset: "USDT", isSpotTradingAllowed: false },
          ])
        )
      )
    );
    const { getExchangeInfo } = await import("@/lib/marketDataExchange");
    const info = await getExchangeInfo();
    expect(info.stale).toBe(false);
    expect(info.bySymbol.has("BTCUSDT")).toBe(true);
    expect(info.bySymbol.has("DEADUSDT")).toBe(false);
    expect(info.bySymbol.has("NOSELLUSDT")).toBe(false);
  });

  it("validates a supported pair and returns Binance's own casing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(exchangeInfoResponse([{ symbol: "ETHUSDT", baseAsset: "ETH", quoteAsset: "USDT" }]))
      )
    );
    const { validatePair } = await import("@/lib/marketDataExchange");
    const pair = await validatePair("eth", "usdt");
    expect(pair.symbol).toBe("ETHUSDT");
    expect(pair.baseAsset).toBe("ETH");
    expect(pair.quoteAsset).toBe("USDT");
  });

  it("throws UNSUPPORTED_PAIR for an asset with no matching Binance Spot pair (never substitutes one)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(exchangeInfoResponse([{ symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" }]))
      )
    );
    const { validatePair, MarketDataError } = await import("@/lib/marketData");
    await expect(validatePair("NOTAREALCOIN", "USDT")).rejects.toMatchObject({
      code: "UNSUPPORTED_PAIR",
    });
    await expect(validatePair("NOTAREALCOIN", "USDT")).rejects.toBeInstanceOf(MarketDataError);
  });

  it("rejects empty base/quote assets without hitting the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { validatePair } = await import("@/lib/marketDataExchange");
    await expect(validatePair("  ", "USDT")).rejects.toMatchObject({ code: "UNSUPPORTED_PAIR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws UPSTREAM_UNAVAILABLE on a non-OK HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 503)));
    const { getExchangeInfo } = await import("@/lib/marketDataExchange");
    await expect(getExchangeInfo()).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });

  it("throws UPSTREAM_TIMEOUT when the request aborts due to timeout", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));
    const { getExchangeInfo } = await import("@/lib/marketDataExchange");
    await expect(getExchangeInfo()).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT" });
  });

  it("throws UPSTREAM_UNAVAILABLE on a generic network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { getExchangeInfo } = await import("@/lib/marketDataExchange");
    await expect(getExchangeInfo()).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });

  it("throws MALFORMED_RESPONSE when JSON parsing fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response)
    );
    const { getExchangeInfo } = await import("@/lib/marketDataExchange");
    await expect(getExchangeInfo()).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it("throws MALFORMED_RESPONSE when the `symbols` array is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ notSymbols: [] })));
    const { getExchangeInfo } = await import("@/lib/marketDataExchange");
    await expect(getExchangeInfo()).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it("throws MALFORMED_RESPONSE when no usable TRADING spot symbols remain after filtering", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(exchangeInfoResponse([{ symbol: "X", baseAsset: "X", quoteAsset: "Y", status: "BREAK" }]))
      )
    );
    const { getExchangeInfo } = await import("@/lib/marketDataExchange");
    await expect(getExchangeInfo()).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it("caches exchange info and does not refetch within the TTL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(exchangeInfoResponse([{ symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" }]))
      );
    vi.stubGlobal("fetch", fetchMock);
    const { getExchangeInfo } = await import("@/lib/marketDataExchange");
    await getExchangeInfo();
    await getExchangeInfo();
    await getExchangeInfo();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates concurrent cold-cache requests into a single upstream fetch", async () => {
    let resolveResponse!: (v: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);
    const { getExchangeInfo } = await import("@/lib/marketDataExchange");

    const a = getExchangeInfo();
    const b = getExchangeInfo();
    resolveResponse(
      jsonResponse(exchangeInfoResponse([{ symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" }]))
    );
    const [infoA, infoB] = await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(infoA.bySymbol.has("BTCUSDT")).toBe(true);
    expect(infoB.bySymbol.has("BTCUSDT")).toBe(true);
  });

  it("falls back to a stale in-memory copy when a later refresh fails, and marks it stale", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(exchangeInfoResponse([{ symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" }]))
      )
      .mockRejectedValueOnce(new Error("Binance is down"));
    vi.stubGlobal("fetch", fetchMock);
    const { getExchangeInfo } = await import("@/lib/marketDataExchange");

    const fresh = await getExchangeInfo();
    expect(fresh.stale).toBe(false);

    // Advance past the 1h TTL so the next call attempts a refresh.
    vi.advanceTimersByTime(61 * 60 * 1000);

    const stale = await getExchangeInfo();
    expect(stale.stale).toBe(true);
    expect(stale.bySymbol.has("BTCUSDT")).toBe(true);
    vi.useRealTimers();
  });
});
