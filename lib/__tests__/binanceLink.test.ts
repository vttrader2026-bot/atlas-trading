// BINANCE-HANDOFF-v1: the link only OPENS Binance Spot. Normalization, URL and symbol validation.
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { binanceLocale, binanceSpotUrl, normalizePair, resolveBinanceSpot } from "@/lib/binanceLink";

const SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "SOLUSDT", "1000SATSUSDT"]);

describe("normalizePair", () => {
  it.each([
    ["BTC/USDT", "BTCUSDT"], ["btcusdt", "BTCUSDT"], ["BTC-USDT", "BTCUSDT"], ["BTC_USDT", "BTCUSDT"],
    [" btc / usdt ", "BTCUSDT"], ["1000SATS/USDT", "1000SATSUSDT"],
  ])("%s -> %s", (input, symbol) => {
    expect(normalizePair(input)?.symbol).toBe(symbol);
    expect(normalizePair(input)?.pair).toBe(`${symbol.slice(0, -4)}/USDT`);
  });
  it.each([["ETH/BTC"], ["ETHBTC"], ["BTC"], [""], ["   "], ["USDT"], ["/USDT"], ["USDT/USDT"], ["BTC/USDT/EXTRA"], ["BT$C/USDT"], ["BTC/USDT?x=1"], ["../USDT"], ["A".repeat(21) + "/USDT"]])(
    "rejects %j", (input) => expect(normalizePair(input)).toBeNull(),
  );
  it("rejects non-strings", () => {
    for (const v of [null, undefined, 5, {}, ["BTC/USDT"]]) expect(normalizePair(v)).toBeNull();
  });
});

describe("binanceSpotUrl", () => {
  it("builds the Spot trade page", () => expect(binanceSpotUrl("BTC/USDT", "en")).toBe("https://www.binance.com/en/trade/BTC_USDT?type=spot"));
  it("follows Atlas's language", () => {
    expect(binanceSpotUrl("eth/usdt", "ar")).toBe("https://www.binance.com/ar/trade/ETH_USDT?type=spot");
    expect(binanceSpotUrl("eth/usdt", "fr")).toBe("https://www.binance.com/fr/trade/ETH_USDT?type=spot");
  });
  it("unknown or missing language falls back to /en/", () => {
    expect(binanceLocale("de")).toBe("en");
    expect(binanceLocale(undefined)).toBe("en");
    expect(binanceSpotUrl("BTC/USDT", null)).toContain("/en/");
  });
  it("is null for invalid pairs and never carries user text into the URL", () => {
    expect(binanceSpotUrl("ETH/BTC")).toBeNull();
    expect(binanceSpotUrl("BTC/USDT?redirect=evil.com")).toBeNull();
    expect(binanceSpotUrl("BTC/USDT#x")).toBeNull();
  });
  it("always points at binance.com over https", () => {
    const u = new URL(binanceSpotUrl("SOL/USDT", "en") as string);
    expect(u.protocol).toBe("https:");
    expect(u.hostname).toBe("www.binance.com");
  });
});

describe("resolveBinanceSpot (checked against the Spot symbol list)", () => {
  it("a listed symbol is verified", () => {
    const r = resolveBinanceSpot("SOL/USDT", "en", SYMBOLS);
    expect(r).toEqual({ ok: true, url: "https://www.binance.com/en/trade/SOL_USDT?type=spot", symbol: "SOLUSDT", verified: true });
  });
  it("a symbol Binance does not list is unsupported", () => expect(resolveBinanceSpot("FAKE/USDT", "en", SYMBOLS)).toEqual({ ok: false, reason: "unsupported" }));
  it("invalid text is invalid, whatever the list says", () => {
    expect(resolveBinanceSpot("ETH/BTC", "en", SYMBOLS)).toEqual({ ok: false, reason: "invalid" });
    expect(resolveBinanceSpot("", "en", SYMBOLS)).toEqual({ ok: false, reason: "invalid" });
  });
  it("list unavailable: the link is still offered, flagged unverified", () => {
    for (const none of [null, undefined]) {
      const r = resolveBinanceSpot("BTC/USDT", "ar", none);
      expect(r.ok && r.verified).toBe(false);
      expect(r.ok && r.url).toContain("/ar/trade/BTC_USDT");
    }
  });
});

describe("product rule: Atlas only opens Binance, it never trades", () => {
  const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  it("the link module and component use no Binance API, key or order endpoint", () => {
    for (const f of ["lib/binanceLink.ts", "components/BinanceSpotLink.tsx", "lib/planJournalSync.ts"]) {
      const code = src(f).replace(/\/\/.*$/gm, "");
      expect(code).not.toMatch(/api\.binance|\/api\/v3\/order|apiKey|secret|signature|X-MBX|withdraw|createOrder|newOrder/i);
    }
  });
  it("the component renders a plain external link that cannot leak the opener", () => {
    const code = src("components/BinanceSpotLink.tsx");
    expect(code).toContain('target="_blank"');
    expect(code).toContain('rel="noopener noreferrer"');
  });
});
