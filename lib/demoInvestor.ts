// HOME-PHONE-v1: DEMO data for the homepage smartphone showcase. Invented numbers, never real portfolio figures.
// Isolated on purpose: only components/home/InvestorPhone.tsx imports this file. The real Investor (lib/investor,
// components/investor, app/investor) never does, and DEMO_MRU_RATE is NOT a rate source for anything real.
import type { InvestorDoc } from "@/lib/investor/model";
import type { PriceMap } from "@/lib/investor/calc";

/** Illustrative USDT -> MRU rate for the demo screen only. Labeled "demo rate" wherever it is shown. */
export const DEMO_MRU_RATE = 40;

const buy = (id: string, asset: string, date: string, qty: number, price: number, fee: number) => ({ id, asset, date, qty, price, fee, quote: "USDT" as const });

export const DEMO_DOC: InvestorDoc = {
  revision: 0,
  bnbDiscount: false,
  plans: [],
  manualPrices: {},
  cash: [
    { id: "d1", date: "2026-01-05", type: "deposit", amount: 9000 },
    { id: "d2", date: "2026-03-02", type: "deposit", amount: 3000 },
  ],
  purchases: [
    buy("p1", "BTC", "2026-01-12", 0.05, 64000, 3.2),
    buy("p2", "ETH", "2026-01-20", 1.2, 3100, 3.72),
    buy("p3", "AVAX", "2026-02-03", 40, 28, 1.12),
    buy("p4", "NEAR", "2026-02-18", 300, 5.2, 1.56),
    buy("p5", "XRP", "2026-03-04", 1500, 0.55, 0.83),
  ],
  sales: [{ id: "s1", asset: "XRP", date: "2026-04-10", qty: 500, price: 0.6, fee: 0.3, quote: "USDT" }],
};

/** Fixed demo prices (shown as demo, never as live). */
export const DEMO_PRICES: PriceMap = {
  BTC: { price: 71500, source: "manual", at: "2026-04-30" },
  ETH: { price: 3450, source: "manual", at: "2026-04-30" },
  AVAX: { price: 26.4, source: "manual", at: "2026-04-30" },
  NEAR: { price: 4.85, source: "manual", at: "2026-04-30" },
  XRP: { price: 0.62, source: "manual", at: "2026-04-30" },
};
