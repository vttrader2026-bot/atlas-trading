import { describe, expect, it } from "vitest";
import { buildRadarRows } from "@/lib/radar";
import { isRadarEligible, usdtBase } from "@/lib/radarUniverse";
import type { Ticker24h } from "@/lib/binance";

const NOW = 1_800_000_000_000;
const t = (symbol: string, o: Partial<Ticker24h> = {}): Ticker24h => ({
  symbol, lastPrice: "10", priceChangePercent: "1", highPrice: "11", lowPrice: "9", quoteVolume: "1000000", ...o,
});

describe("radar universe", () => {
  it("keeps normal crypto/USDT pairs", () => {
    for (const s of ["BTCUSDT", "ETHUSDT", "SYRUPUSDT", "1INCHUSDT", "JUPUSDT"]) expect(isRadarEligible(t(s), NOW)).toBe(true);
  });
  it("removes stablecoins", () => {
    for (const s of ["USDCUSDT", "FDUSDUSDT", "USDEUSDT", "RLUSDUSDT", "EURIUSDT", "DAIUSDT"]) expect(isRadarEligible(t(s), NOW)).toBe(false);
  });
  it("removes fiat pairs like EUR/USDT", () => {
    for (const s of ["EURUSDT", "GBPUSDT", "TRYUSDT", "BRLUSDT", "AUDUSDT", "JPYUSDT"]) expect(isRadarEligible(t(s), NOW)).toBe(false);
  });
  it("removes bStocks", () => {
    for (const s of ["NVDABUSDT", "TSLABUSDT", "SPYBUSDT", "GOOGLBUSDT", "CBRSBUSDT"]) expect(isRadarEligible(t(s), NOW)).toBe(false);
  });
  it("removes non-USDT and malformed symbols", () => {
    for (const s of ["BTCUSDC", "ETHBTC", "USDT", "bad-USDT", ""]) expect(isRadarEligible(t(s), NOW)).toBe(false);
    expect(usdtBase("BTCUSDT")).toBe("BTC");
  });
  it("removes halted / stale / invalid tickers", () => {
    expect(isRadarEligible(t("OLDUSDT", { closeTime: NOW - 3 * 86_400_000 }), NOW)).toBe(false);
    expect(isRadarEligible(t("NEWUSDT", { closeTime: NOW - 1000 }), NOW)).toBe(true);
    expect(isRadarEligible(t("ZEROUSDT", { quoteVolume: "0" }), NOW)).toBe(false);
    expect(isRadarEligible(t("NANUSDT", { lastPrice: "NaN" }), NOW)).toBe(false);
    expect(isRadarEligible(t("FREEUSDT", { lastPrice: "0" }), NOW)).toBe(false);
  });
  it("buildRadarRows applies it", () => {
    const rows = buildRadarRows([t("BTCUSDT"), t("USDCUSDT"), t("EURUSDT"), t("NVDABUSDT")], 0);
    expect(rows.map((r) => r.ticker.symbol)).toEqual(["BTCUSDT"]);
  });
});
