// ELITE-CONFIRM-v1: the pure rules (entry-zone boundaries, price freshness, amounts).
import { describe, expect, it } from "vitest";
import { PRICE_MAX_AGE_MS, checkEntryZone, evaluateFreshPrice, exchangeSymbol, validateAmounts } from "@/lib/eliteConfirm";

describe("checkEntryZone: both boundaries are inside", () => {
  it("minimum boundary is allowed, just below is blocked", () => {
    expect(checkEntryZone(100, "100 - 110").ok).toBe(true);
    expect(checkEntryZone(99.99999999, "100 - 110")).toMatchObject({ ok: false, code: "belowZone" });
  });
  it("maximum boundary is allowed, just above is blocked", () => {
    expect(checkEntryZone(110, "100 - 110").ok).toBe(true);
    expect(checkEntryZone(110.00000001, "100 - 110")).toMatchObject({ ok: false, code: "aboveZone" });
  });
  it("anywhere inside is allowed", () => expect(checkEntryZone(105.5, "100 - 110").ok).toBe(true));
  it("reports the zone and which side the price is on", () => {
    expect(checkEntryZone(50, "100 - 110")).toEqual({ ok: false, code: "belowZone", zone: { low: 100, high: 110 } });
    expect(checkEntryZone(500, "100 - 110")).toEqual({ ok: false, code: "aboveZone", zone: { low: 100, high: 110 } });
  });
  it("reads real published formats: thousands separators, reversed order, timeframe tokens", () => {
    expect(checkEntryZone(61_200, "61,200 - 61,800").ok).toBe(true);
    expect(checkEntryZone(61_800, "61,800 - 61,200").ok).toBe(true);
    expect(checkEntryZone(0.0123, "0.0120 - 0.0125 (4H)").ok).toBe(true);
  });
  it("a single-number zone only accepts that exact price", () => {
    expect(checkEntryZone(100, "100").ok).toBe(true);
    expect(checkEntryZone(100.01, "100")).toMatchObject({ ok: false, code: "aboveZone" });
  });
  it("an unreadable zone blocks instead of guessing", () => {
    for (const z of ["wait for a dip", "", null, undefined, "1 - 2 - 3"]) expect(checkEntryZone(100, z)).toEqual({ ok: false, code: "zoneUnreadable" });
    expect(checkEntryZone(Number.NaN, "100 - 110")).toEqual({ ok: false, code: "zoneUnreadable" });
  });
});

describe("evaluateFreshPrice: unavailable or stale data blocks", () => {
  const now = 1_800_000_000_000;
  it("accepts a current price", () => expect(evaluateFreshPrice({ lastPrice: "105.5", closeTime: now - 1000 }, now)).toEqual({ ok: true, price: 105.5, at: now - 1000 }));
  it("accepts a price exactly at the age limit, rejects one millisecond older", () => {
    expect(evaluateFreshPrice({ lastPrice: "1", closeTime: now - PRICE_MAX_AGE_MS }, now).ok).toBe(true);
    expect(evaluateFreshPrice({ lastPrice: "1", closeTime: now - PRICE_MAX_AGE_MS - 1 }, now)).toEqual({ ok: false, code: "priceStale" });
  });
  it("rejects a timestamp far in the future", () => expect(evaluateFreshPrice({ lastPrice: "1", closeTime: now + 10 * 60_000 }, now)).toEqual({ ok: false, code: "priceStale" }));
  it("missing, zero, negative or non-numeric prices are unavailable", () => {
    for (const lastPrice of [undefined, null, "", "0", "-5", "abc", Number.NaN]) expect(evaluateFreshPrice({ lastPrice, closeTime: now }, now)).toEqual({ ok: false, code: "priceUnavailable" });
    expect(evaluateFreshPrice(null, now)).toEqual({ ok: false, code: "priceUnavailable" });
  });
  it("a price with no exchange timestamp cannot be proven fresh, so it is unavailable", () => {
    expect(evaluateFreshPrice({ lastPrice: "100" }, now)).toEqual({ ok: false, code: "priceUnavailable" });
    expect(evaluateFreshPrice({ lastPrice: "100", closeTime: 0 }, now)).toEqual({ ok: false, code: "priceUnavailable" });
  });
});

describe("validateAmounts / exchangeSymbol", () => {
  it("requires a positive entry and a positive investment", () => {
    expect(validateAmounts({ entry: 100, invested: 250 })).toEqual({ ok: true, entry: 100, invested: 250 });
    expect(validateAmounts({ entry: 0, invested: 250 })).toEqual({ ok: false, field: "entry" });
    expect(validateAmounts({ entry: 100 })).toEqual({ ok: false, field: "invested" });
    expect(validateAmounts({ entry: 100, invested: -1 })).toEqual({ ok: false, field: "invested" });
    expect(validateAmounts({ entry: "100", invested: 1 })).toEqual({ ok: false, field: "entry" });
    expect(validateAmounts({ entry: Number.POSITIVE_INFINITY, invested: 1 })).toEqual({ ok: false, field: "entry" });
  });
  it("maps pairs to Binance symbols, USDT only", () => {
    expect(exchangeSymbol("BTC/USDT")).toBe("BTCUSDT");
    expect(exchangeSymbol("zro-usdt")).toBe("ZROUSDT");
    expect(exchangeSymbol("BTC/EUR")).toBeNull();
    expect(exchangeSymbol("../../x")).toBeNull();
  });
});
