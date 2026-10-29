import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ticker24h } from "@/lib/binance";
import { buildRadarRows } from "@/lib/radar";

const tk = (base: string): Ticker24h => ({
  symbol: base + "USDT", lastPrice: "10", priceChangePercent: "1", highPrice: "11", lowPrice: "9", quoteVolume: "1000000",
});

describe("buildRadarRows with the spot allowlist", () => {
  const delisted = ["CREAM", "PNT", "KDA", "CLV", "MDX", "WAVES", "STG", "HOOK", "ELF", "REN", "FLM", "ADADOWN", "HIFI", "HFT", "ERN", "PLA", "LIT", "XMR", "PERP", "COS"];
  const all = [tk("BTC"), tk("ETH"), ...delisted.map(tk)];
  it("drops every symbol that is not trading on spot", () => {
    const spot = new Set(["BTCUSDT", "ETHUSDT"]);
    expect(buildRadarRows(all, 0, spot).map((r) => r.ticker.symbol)).toEqual(["BTCUSDT", "ETHUSDT"]);
  });
  it("falls back to built-in rules when the list is unavailable", () => {
    expect(buildRadarRows(all, 0, null)).toHaveLength(all.length);
    expect(buildRadarRows(all, 0)).toHaveLength(all.length);
  });
});

describe("getSpotTradingSymbols", () => {
  const sym = (s: string, o = {}) => ({ symbol: s, quoteAsset: "USDT", status: "TRADING", isSpotTradingAllowed: true, ...o });
  const big = Array.from({ length: 60 }, (_, i) => sym(`C${i}USDT`));
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("keeps only TRADING, spot-allowed USDT pairs and caches the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ symbols: [...big, sym("KDAUSDT", { status: "BREAK" }), sym("XMRUSDT", { isSpotTradingAllowed: false }), sym("ETHBTC", { quoteAsset: "BTC" })] }) });
    vi.stubGlobal("fetch", fetchMock);
    const { getSpotTradingSymbols } = await import("@/lib/binance");
    const a = await getSpotTradingSymbols();
    const b = await getSpotTradingSymbols();
    expect(a?.size).toBe(60);
    expect(a?.has("KDAUSDT")).toBe(false);
    expect(a?.has("XMRUSDT")).toBe(false);
    expect(a?.has("ETHBTC")).toBe(false);
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("returns null on network error, bad status or implausibly small list", async () => {
    for (const f of [
      vi.fn().mockRejectedValue(new Error("down")),
      vi.fn().mockResolvedValue({ ok: false }),
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ symbols: [sym("BTCUSDT")] }) }),
    ]) {
      vi.resetModules(); vi.stubGlobal("fetch", f);
      const { getSpotTradingSymbols } = await import("@/lib/binance");
      expect(await getSpotTradingSymbols()).toBeNull();
    }
  });
});
