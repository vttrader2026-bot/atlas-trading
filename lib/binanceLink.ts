// BINANCE-HANDOFF-v1
// Builds a link that OPENS a Binance Spot trading page. Nothing more: no Binance API call, no order, no account access.
// Atlas never submits, modifies or cancels orders; the member executes manually on Binance.
// Pure and safe to import anywhere (browser or server).

import type { Lang } from "@/lib/i18n";

export type BinancePair = { base: string; symbol: string; pair: string };

const BASE_RE = /^[A-Z0-9]{1,20}$/;

/**
 * Accepts "BTC/USDT", "btcusdt", "BTC-USDT", "BTC_USDT", " btc / usdt ". Only USDT spot pairs are supported.
 * A bare coin ("BTC") is rejected on purpose: "ETHBTC" must never be read as the coin "ETHBTC".
 * Returns null for anything else (other quote assets, symbols, empty text, anything with unexpected characters).
 */
export function normalizePair(input: unknown): BinancePair | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  let base: string;
  const parts = s.split(/[/_-]/);
  if (parts.length === 2) {
    if (parts[1] !== "USDT") return null;
    base = parts[0];
  } else if (parts.length === 1 && s.endsWith("USDT") && s.length > 4) {
    base = s.slice(0, -4);
  } else {
    return null;
  }
  if (base === "USDT" || !BASE_RE.test(base)) return null;
  return { base, symbol: `${base}USDT`, pair: `${base}/USDT` };
}

/** Binance language folder for the current Atlas language. */
export function binanceLocale(lang: string | null | undefined): "en" | "ar" | "fr" {
  return lang === "ar" ? "ar" : lang === "fr" ? "fr" : "en";
}

/** https://www.binance.com/en/trade/BTC_USDT?type=spot, or null when the pair is not a valid USDT pair. */
export function binanceSpotUrl(pair: unknown, lang: Lang | string | null | undefined = "en"): string | null {
  const p = normalizePair(pair);
  if (!p) return null;
  return `https://www.binance.com/${binanceLocale(lang)}/trade/${p.base}_USDT?type=spot`;
}

export type SpotLinkResult =
  | { ok: true; url: string; symbol: string; /** true = the symbol was found in Binance's live Spot list; false = the list was unavailable. */ verified: boolean }
  | { ok: false; reason: "invalid" | "unsupported" };

/**
 * Link for a pair, checked against the set from getSpotTradingSymbols().
 *  - invalid text or a non-USDT pair  -> { ok: false, reason: "invalid" }
 *  - a symbol Binance does not list for Spot trading -> { ok: false, reason: "unsupported" }
 *  - symbol list unavailable (null / undefined) -> the link is still offered, flagged verified: false
 */
export function resolveBinanceSpot(pair: unknown, lang: Lang | string | null | undefined, symbols: ReadonlySet<string> | null | undefined): SpotLinkResult {
  const p = normalizePair(pair);
  if (!p) return { ok: false, reason: "invalid" };
  if (symbols && !symbols.has(p.symbol)) return { ok: false, reason: "unsupported" };
  return { ok: true, url: binanceSpotUrl(p.pair, lang) as string, symbol: p.symbol, verified: !!symbols };
}
