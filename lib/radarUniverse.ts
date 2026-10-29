import type { Ticker24h } from "@/lib/binance";

// Which Binance pairs Radar is allowed to show. Radar is a crypto-vs-USDT
// screen: no stablecoins, no fiat pairs, no tokenized stocks (bStocks), and
// no halted/stale symbols that only linger in the 24h ticker feed.

const STABLECOIN_BASES = new Set([
  "USDC", "BUSD", "TUSD", "DAI", "FDUSD", "USDP", "PYUSD", "GUSD", "USTC", "EURI",
  "AEUR", "FRAX", "USD1", "USDE", "USDS", "USDD", "USD0", "USDG", "RLUSD", "XUSD",
  "BFUSD", "LUSD", "SUSD", "EURC", "EURT", "UST", "USDJ", "USDX", "USDSB", "AUSD",
]);

// Fiat currencies listed as bases (EUR/USDT, TRY/USDT ...) — not tradeable crypto.
const FIAT_BASES = new Set([
  "EUR", "GBP", "TRY", "BRL", "AUD", "JPY", "RUB", "UAH", "ARS", "ZAR", "PLN", "RON",
  "CZK", "MXN", "COP", "IDR", "NGN", "CAD", "CHF", "KZT", "HUF", "SEK", "NOK", "DKK",
  "INR", "PHP", "THB", "VND", "KRW", "CNY", "HKD", "SGD", "NZD", "AED", "SAR", "EGP",
]);

// Binance bStocks (tokenized US equities / ETFs, ticker + "B"). Add new ones here.
const BSTOCK_BASES = new Set([
  "CBRSB", "COINB", "DRAMB", "GLWB", "GOOGLB", "NBISB", "QCOMB", "SOXLB", "SPYB", "WDCB",
  "AMDB", "EWYB", "INTCB", "MSTRB", "NVDAB", "TSLAB", "CRCLB",
]);

/** Base asset of an X/USDT pair, or null when it isn't a USDT pair. */
export function usdtBase(symbol: string): string | null {
  if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol)) return null;
  const base = symbol.slice(0, -4);
  return base.length >= 1 ? base : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isRadarEligible(t: Ticker24h, now: number = Date.now()): boolean {
  const base = usdtBase(t.symbol);
  if (!base) return false;
  if (STABLECOIN_BASES.has(base) || FIAT_BASES.has(base) || BSTOCK_BASES.has(base)) return false;
  // Halted / delisted symbols keep a frozen ticker: no volume, or last trade over a day old.
  const price = Number(t.lastPrice);
  const volume = Number(t.quoteVolume);
  if (!Number.isFinite(price) || price <= 0) return false;
  if (!Number.isFinite(volume) || volume <= 0) return false;
  if (typeof t.closeTime === "number" && t.closeTime > 0 && now - t.closeTime > DAY_MS) return false;
  return true;
}
