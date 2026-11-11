// ATLAS INVESTOR display currency (USDT or MRU). DISPLAY ONLY: every stored amount, calculation and API stays in USDT/USD.
// The MRU figure is a reference rate (USD→MRU) converted at render time. It is not a Binance P2P buy/sell price.

import { price as usdtPrice, signedUsd as usdtSigned, usd as usdtMoney } from "@/components/investor/fmt";

export type DisplayCurrency = "USDT" | "MRU";
export const CURRENCIES: readonly DisplayCurrency[] = ["USDT", "MRU"];

/** A rate whose source timestamp is older than this is treated as unavailable (fall back to USDT). */
export const MAX_RATE_AGE_MS = 48 * 60 * 60 * 1000;
/** Allowed clock skew for a source timestamp slightly in the future. */
const FUTURE_SKEW_MS = 10 * 60 * 1000;

export type RateInfo = {
  /** MRU per 1 USD. */
  rate: number;
  /** When the source (open.er-api.com) last updated this rate, ms since epoch. */
  sourceUpdatedAt: number;
  /** When our server last fetched it, ms since epoch. */
  fetchedAt: number;
  /** True when the upstream was unreachable and the last valid cached rate is being reused. */
  stale?: boolean;
};

export const isValidRate = (r: unknown): r is number => typeof r === "number" && Number.isFinite(r) && r > 0 && r < 1e6;

/** A rate is usable only if it is a valid number and its source update is at most 48 hours old. No fallback value exists. */
export function isRateUsable(info: RateInfo | null | undefined, now: number): boolean {
  if (!info || !isValidRate(info.rate)) return false;
  if (typeof info.sourceUpdatedAt !== "number" || !Number.isFinite(info.sourceUpdatedAt) || info.sourceUpdatedAt <= 0) return false;
  const age = now - info.sourceUpdatedAt;
  return age <= MAX_RATE_AGE_MS && age >= -FUTURE_SKEW_MS;
}

/** What is actually shown: MRU only when chosen AND a usable rate exists; otherwise USDT. */
export function effectiveCurrency(choice: DisplayCurrency, info: RateInfo | null | undefined, now: number): DisplayCurrency {
  return choice === "MRU" && isRateUsable(info, now) ? "MRU" : "USDT";
}

// ───────────────────────── persistence (per user, this browser) ─────────────────────────

export const currencyKey = (userId: string) => `atlas.investor.currency:${userId}`;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Defaults to USDT for anything missing, unreadable or unknown. */
export function loadCurrency(storage: StorageLike | null | undefined, userId: string | null | undefined): DisplayCurrency {
  if (!storage || !userId) return "USDT";
  try {
    const v = storage.getItem(currencyKey(userId));
    return v === "MRU" ? "MRU" : "USDT";
  } catch {
    return "USDT";
  }
}

export function saveCurrency(storage: StorageLike | null | undefined, userId: string | null | undefined, c: DisplayCurrency): boolean {
  if (!storage || !userId) return false;
  try {
    storage.setItem(currencyKey(userId), c);
    return true;
  } catch {
    return false;
  }
}

// ───────────────────────── formatting ─────────────────────────

const group = (n: number, minD: number, maxD: number) => n.toLocaleString("en-US", { minimumFractionDigits: minD, maximumFractionDigits: maxD });

/** USDT output is byte-identical to the original formatters; MRU converts first, then formats with the same rules. */
export function formatMoney(n: number, c: DisplayCurrency, rate: number | null): string {
  if (c !== "MRU" || rate === null) return usdtMoney(n);
  const v = n * rate;
  return `${v < 0 ? "-" : ""}MRU ${group(Math.abs(v), 2, 2)}`;
}

export function formatSignedMoney(n: number, c: DisplayCurrency, rate: number | null): string {
  if (c !== "MRU" || rate === null) return usdtSigned(n);
  return `${n > 0 ? "+" : ""}${formatMoney(n, c, rate)}`;
}

/** Unit crypto price (e.g. BTC). Converted, then shown with adaptive decimals so cheap coins still read well. */
export function formatUnitPrice(n: number, c: DisplayCurrency, rate: number | null): string {
  if (c !== "MRU" || rate === null) return usdtPrice(n);
  const v = n * rate;
  const a = Math.abs(v);
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8;
  return `${v < 0 ? "-" : ""}MRU ${group(Math.abs(v), 2, d)}`;
}
