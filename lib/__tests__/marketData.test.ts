import { describe, it, expect, vi, beforeEach } from "vitest";

const validatePairMock = vi.fn();
const getValidatedKlinesMock = vi.fn();

vi.mock("@/lib/marketDataExchange", async () => {
  const actual = await vi.importActual<typeof import("@/lib/marketDataExchange")>(
    "@/lib/marketDataExchange"
  );
  return { ...actual, validatePair: validatePairMock };
});
vi.mock("@/lib/marketDataKlines", async () => {
  const actual = await vi.importActual<typeof import("@/lib/marketDataKlines")>(
    "@/lib/marketDataKlines"
  );
  return { ...actual, getValidatedKlines: getValidatedKlinesMock };
});

describe("marketData (public entry point)", () => {
  beforeEach(() => {
    validatePairMock.mockReset();
    getValidatedKlinesMock.mockReset();
  });

  it("getCandles validates the pair before fetching candles, and returns both", async () => {
    const pair = { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", isSpotTradingAllowed: true };
    validatePairMock.mockResolvedValue(pair);
    getValidatedKlinesMock.mockResolvedValue({ candles: [], stale: false });

    const { getCandles } = await import("@/lib/marketData");
    const result = await getCandles("BTC", "1h");

    expect(validatePairMock).toHaveBeenCalledWith("BTC", "USDT");
    expect(getValidatedKlinesMock).toHaveBeenCalledWith("BTCUSDT", "1h", undefined);
    expect(result.pair).toEqual(pair);
    expect(result.candles).toEqual([]);
  });

  it("getCandles never fetches candles for an unvalidated/unsupported pair", async () => {
    const { MarketDataError } = await import("@/lib/marketDataTypes");
    validatePairMock.mockRejectedValue(new MarketDataError("UNSUPPORTED_PAIR", "nope"));

    const { getCandles } = await import("@/lib/marketData");
    await expect(getCandles("NOTREAL", "1h")).rejects.toMatchObject({ code: "UNSUPPORTED_PAIR" });
    expect(getValidatedKlinesMock).not.toHaveBeenCalled();
  });

  it("tryValidatePair returns the pair on success", async () => {
    const pair = { symbol: "ETHUSDT", baseAsset: "ETH", quoteAsset: "USDT", isSpotTradingAllowed: true };
    validatePairMock.mockResolvedValue(pair);
    const { tryValidatePair } = await import("@/lib/marketData");
    await expect(tryValidatePair("ETH")).resolves.toEqual(pair);
  });

  it("tryValidatePair returns null (not a guess) instead of throwing when unsupported", async () => {
    const { MarketDataError } = await import("@/lib/marketDataTypes");
    validatePairMock.mockRejectedValue(new MarketDataError("UNSUPPORTED_PAIR", "nope"));
    const { tryValidatePair } = await import("@/lib/marketData");
    await expect(tryValidatePair("NOTREAL")).resolves.toBeNull();
  });
});
