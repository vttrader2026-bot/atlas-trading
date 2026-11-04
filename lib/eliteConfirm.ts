// ELITE-CONFIRM-v1
// Pure rules for "Confirm Trade" on an ELITE signal. No storage, no network: the route
// (app/api/me/confirm-trade/route.ts) fetches the price and applies these rules server-side.
//
// A member may confirm only while the FRESH market price (fetched when they press Confirm) is inside the
// official entry zone, both boundaries included. Missing, unreadable or stale price data blocks.

import { zoneOf } from "@/lib/signalLink";

/** A price older than this (by the exchange's own timestamp) counts as stale. */
export const PRICE_MAX_AGE_MS = 60_000;
/** Tolerated clock difference when the exchange timestamp is slightly ahead of ours. */
export const PRICE_MAX_FUTURE_MS = 30_000;

export type FreshPrice = { price: number; at: number };
export type PriceCheck = ({ ok: true } & FreshPrice) | { ok: false; code: "priceUnavailable" | "priceStale" };

/** Accepts a ticker as Binance returns it ({lastPrice, closeTime}). Anything unusable blocks. */
export function evaluateFreshPrice(ticker: { lastPrice?: unknown; closeTime?: unknown } | null | undefined, now: number): PriceCheck {
  const price = Number(ticker?.lastPrice);
  const at = Number(ticker?.closeTime);
  if (!ticker || !Number.isFinite(price) || price <= 0) return { ok: false, code: "priceUnavailable" };
  // Without the exchange's own timestamp we cannot prove the price is fresh, so it is not accepted.
  if (!Number.isFinite(at) || at <= 0) return { ok: false, code: "priceUnavailable" };
  const age = now - at;
  if (age > PRICE_MAX_AGE_MS || age < -PRICE_MAX_FUTURE_MS) return { ok: false, code: "priceStale" };
  return { ok: true, price, at };
}

export type ZoneCheck =
  | { ok: true; zone: { low: number; high: number } }
  | { ok: false; code: "belowZone" | "aboveZone"; zone: { low: number; high: number } }
  | { ok: false; code: "zoneUnreadable" };

/** Inclusive on both ends: price === low and price === high are inside. */
export function checkEntryZone(price: number, entryZone: string | null | undefined): ZoneCheck {
  const zone = zoneOf(entryZone);
  if (!zone || !Number.isFinite(price)) return { ok: false, code: "zoneUnreadable" };
  if (price < zone.low) return { ok: false, code: "belowZone", zone };
  if (price > zone.high) return { ok: false, code: "aboveZone", zone };
  return { ok: true, zone };
}

/** Member-typed amounts. Both are required and must be positive finite numbers. */
export function validateAmounts(input: { entry?: unknown; invested?: unknown }): { ok: true; entry: number; invested: number } | { ok: false; field: "entry" | "invested" } {
  const entry = typeof input.entry === "number" ? input.entry : Number.NaN;
  const invested = typeof input.invested === "number" ? input.invested : Number.NaN;
  if (!Number.isFinite(entry) || entry <= 0) return { ok: false, field: "entry" };
  if (!Number.isFinite(invested) || invested <= 0) return { ok: false, field: "invested" };
  return { ok: true, entry, invested };
}

/** "BTC/USDT" -> "BTCUSDT". Only USDT spot pairs are supported by the feed. */
export function exchangeSymbol(pair: string): string | null {
  const s = pair.replace(/[\/\s-]/g, "").toUpperCase();
  return /^[A-Z0-9]{2,15}USDT$/.test(s) ? s : null;
}

/** What the server stores per member and signal. Official levels are NOT copied here; the Journal trade's `signal` link holds them. */
export type Confirmation = {
  signalId: string;
  /** Id of the Journal trade created from this confirmation. */
  tradeId: string;
  /** Member's own numbers. */
  entry: number;
  invested: number;
  /** The fresh price that was checked, and the exchange timestamp it carried. */
  checkedPrice: number;
  checkedAt: number;
  confirmedAt: number;
};
