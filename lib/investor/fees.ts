// ATLAS INVESTOR: Binance spot fees, calculated automatically (Taker, regular user).
//  USDT pairs: 0.10%.  USDC pairs: 0.095%.  Paying fees with BNB gives 25% off: 0.075% and 0.07125%.
// The calculated amount is stored on each record, so later changes to the switch never rewrite history.
import { Quote, r8 } from "./model";

export const BASE_RATE_PCT: Record<Quote, number> = { USDT: 0.1, USDC: 0.095 };
export const BNB_DISCOUNT = 0.25;

/** Fee rate in percent, e.g. 0.1 means 0.10%. */
export const feeRatePct = (quote: Quote, bnb: boolean): number => Math.round(BASE_RATE_PCT[quote] * (bnb ? 1 - BNB_DISCOUNT : 1) * 1e6) / 1e6;

/** Fee in dollars for a trade of qty x price. */
export const calcFee = (qty: number, price: number, quote: Quote, bnb: boolean): number =>
  Number.isFinite(qty) && Number.isFinite(price) && qty > 0 && price > 0 ? r8((qty * price * feeRatePct(quote, bnb)) / 100) : 0;

/** "0.10", "0.075", "0.07125": no trailing zeros beyond two decimals. */
export const formatRate = (pct: number): string => {
  const s = pct.toFixed(5).replace(/0+$/, "");
  return s.endsWith(".") ? s + "00" : s.split(".")[1].length < 2 ? s + "0" : s;
};
