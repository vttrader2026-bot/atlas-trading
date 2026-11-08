import { describe, it, expect } from "vitest";
import { INVESTOR_ASSETS, TICKERS, isSupportedTicker, searchAssets } from "../investor/assets";
import { emptyDoc, parseDoc, InvestorDoc } from "../investor/model";
import { computePositions, cashBalance, resolvePrices, summarize, ledgerIssue } from "../investor/calc";
import { nthDate, planProgress } from "../investor/dca";
import { applyShock, maxDrawdownPct, worstHistoricalScenario } from "../investor/risk";
import { valueSeries } from "../investor/performance";

const buy = (id: string, date: string, qty: number, price: number, fee = 0, asset = "BTC") => ({ id, asset, date, qty, price, fee });
const doc = (p: Partial<InvestorDoc>): InvestorDoc => ({ ...emptyDoc(), ...p });

describe("supported assets", () => {
  it("has exactly the 17 assets in spec order, including ADA and HYPE", () => {
    expect(TICKERS).toEqual(["BTC","ETH","SOL","XRP","HYPE","DOGE","LINK","AVAX","HBAR","LTC","BNB","DOT","SUI","NEAR","TRX","ZEC","ADA"]);
    expect(INVESTOR_ASSETS).toHaveLength(17);
    expect(isSupportedTicker("ADA")).toBe(true);
    expect(isSupportedTicker("HYPE")).toBe(true);
    expect(isSupportedTicker("SHIB")).toBe(false);
  });
  it("search matches name or ticker", () => {
    expect(searchAssets("hyper").map((a) => a.ticker)).toEqual(["HYPE"]);
    expect(searchAssets("ada").map((a) => a.ticker)).toContain("ADA");
    expect(searchAssets("")).toHaveLength(17);
  });
});

describe("average cost, fees and partial sales", () => {
  const d = doc({
    purchases: [buy("a", "2025-01-01", 1, 100, 2), buy("b", "2025-02-01", 1, 200, 0)],
    sales: [{ id: "s", asset: "BTC", date: "2025-03-01", qty: 0.5, price: 300, fee: 5 }],
  });
  it("includes purchase fees in cost basis", () => {
    const { positions } = computePositions({ purchases: d.purchases, sales: [] });
    const p = positions.get("BTC")!;
    expect(p.costBasis).toBe(302);
    expect(p.avgPrice).toBe(151);
    expect(p.avgPriceExFees).toBe(150);
  });
  it("partial sale keeps average, reduces qty and cost, banks realized PnL net of selling fee", () => {
    const p = computePositions(d).positions.get("BTC")!;
    expect(p.qty).toBe(1.5);
    expect(p.costBasis).toBe(226.5);
    expect(p.avgPrice).toBe(151);
    expect(p.realizedPnl).toBe(150 - 5 - 75.5);
  });
  it("full sale keeps realized PnL after the position is zero", () => {
    const full = doc({ purchases: [buy("a", "2025-01-01", 2, 100)], sales: [{ id: "s", asset: "BTC", date: "2025-02-01", qty: 2, price: 150, fee: 1 }] });
    const p = computePositions(full).positions.get("BTC")!;
    expect(p.qty).toBe(0);
    expect(p.costBasis).toBe(0);
    expect(p.realizedPnl).toBe(99);
  });
  it("flags a sale larger than the holding on that date", () => {
    const bad = doc({ purchases: [buy("a", "2025-02-01", 1, 100)], sales: [{ id: "s", asset: "BTC", date: "2025-01-01", qty: 1, price: 100, fee: 0 }] });
    expect(ledgerIssue(bad)?.saleId).toBe("s");
    expect(ledgerIssue(d)).toBeNull();
  });
  it("purchases before sales on the same day", () => {
    const same = doc({ purchases: [buy("a", "2025-01-01", 1, 100)], sales: [{ id: "s", asset: "BTC", date: "2025-01-01", qty: 1, price: 110, fee: 0 }] });
    expect(ledgerIssue(same)).toBeNull();
  });
});

describe("cash ledger", () => {
  it("counts sale proceeds once and never from the ledger", () => {
    const d = doc({
      cash: [{ id: "c1", date: "2025-01-01", type: "deposit", amount: 1000 }, { id: "c2", date: "2025-04-01", type: "withdrawal", amount: 100 }],
      purchases: [buy("a", "2025-01-02", 1, 400, 4)],
      sales: [{ id: "s", asset: "BTC", date: "2025-03-01", qty: 0.5, price: 600, fee: 3 }],
    });
    // 1000 - 100 - 404 + (300 - 3)
    expect(cashBalance(d)).toBe(793);
    expect(summarize(d, {}).cash).toBe(793);
  });
  it("rejects sales or purchases smuggled into the cash ledger", () => {
    const raw = { ...emptyDoc(), cash: [{ id: "x", date: "2025-01-01", type: "sale", amount: 5 }] };
    expect(parseDoc(raw).ok).toBe(false);
  });
});

describe("price source and summary", () => {
  it("prefers live Binance, falls back to labelled manual, else null", () => {
    const p = resolvePrices({ BTCUSDT: { lastPrice: "50000" }, ETHUSDT: { lastPrice: "0" } }, { ETH: { price: 3000, at: "t" }, HYPE: { price: 40, at: "t2" } });
    expect(p.BTC).toEqual({ price: 50000, source: "binance" });
    expect(p.ETH).toEqual({ price: 3000, source: "manual", at: "t" });
    expect(p.HYPE?.source).toBe("manual");
    expect(p.ADA).toBeNull();
  });
  it("unrealized/ROI cover priced assets only and report missing prices", () => {
    const d = doc({ purchases: [buy("a", "2025-01-01", 1, 100), buy("b", "2025-01-01", 10, 10, 0, "HYPE")] });
    const s = summarize(d, resolvePrices({ BTCUSDT: { lastPrice: "150" } }, {}));
    expect(s.invested).toBe(200);
    expect(s.value).toBe(150);
    expect(s.unrealized).toBe(50);
    expect(s.roiPct).toBe(50);
    expect(s.missingPrices).toEqual(["HYPE"]);
    expect(s.usesManualPrices).toBe(false);
    const m = summarize(d, resolvePrices({ BTCUSDT: { lastPrice: "150" } }, { HYPE: { price: 12, at: "t" } }));
    expect(m.usesManualPrices).toBe(true);
    expect(m.missingPrices).toEqual([]);
    expect(m.holdings.find((h) => h.asset === "HYPE")?.allocationPct).toBeCloseTo((120 / 270) * 100);
  });
});

describe("validation", () => {
  it("accepts a valid doc and rejects unsupported coins, bad numbers, dates and duplicate ids", () => {
    const ok = { ...emptyDoc(), purchases: [buy("a", "2025-01-01", 1, 100)] };
    expect(parseDoc(ok).ok).toBe(true);
    expect(parseDoc({ ...ok, purchases: [buy("a", "2025-01-01", 1, 100, 0, "SHIB")] }).ok).toBe(false);
    expect(parseDoc({ ...ok, purchases: [buy("a", "2025-01-01", -1, 100)] }).ok).toBe(false);
    expect(parseDoc({ ...ok, purchases: [buy("a", "2025-02-30", 1, 100)] }).ok).toBe(false);
    expect(parseDoc({ ...ok, purchases: [buy("a", "2025-01-01", 1, 100), buy("a", "2025-01-02", 1, 100)] }).ok).toBe(false);
    expect(parseDoc({ ...ok, purchases: [buy("a", "2025-01-01", NaN, 100)] }).ok).toBe(false);
    expect(parseDoc(null).ok).toBe(false);
  });
});

describe("dca", () => {
  const plan = { id: "p", name: "P", asset: "BTC", budget: 1000, initial: 200, recurring: { amount: 100, frequency: "monthly" as const, startDate: "2025-01-31", count: 3 }, dips: [{ dropPct: 20, amount: 150 }], refPrice: 100, createdAt: "x" };
  it("monthly dates clamp to month end", () => {
    expect(nthDate("2025-01-31", "monthly", 1)).toBe("2025-02-28");
    expect(nthDate("2025-01-01", "weekly", 2)).toBe("2025-01-15");
  });
  it("tracks remaining budget, due and triggered slots", () => {
    const linked = [{ ...buy("a", "2025-01-31", 2, 100, 0), planId: "p", slot: "initial" }];
    const pr = planProgress(plan, linked, "2025-03-15", 70);
    expect(pr.spent).toBe(200);
    expect(pr.remaining).toBe(800);
    expect(pr.slots.find((s) => s.key === "initial")?.status).toBe("done");
    expect(pr.slots.find((s) => s.key === "r1")?.status).toBe("due");
    expect(pr.slots.find((s) => s.key === "d1")?.status).toBe("triggered");
    expect(pr.slots.find((s) => s.key === "d1")?.triggerPrice).toBe(80);
    expect(planProgress(plan, linked, "2025-03-15", 90).slots.find((s) => s.key === "d1")?.status).toBe("waiting");
  });
});

describe("risk and performance", () => {
  it("shock math and drawdown", () => {
    const o = applyShock([{ value: 1000 }, { value: 500 }], -40);
    expect(o.after).toBe(900);
    expect(o.changePct).toBe(-40);
    expect(applyShock([{ value: 100 }], -200).after).toBe(0);
    expect(maxDrawdownPct([100, 200, 100, 150])).toBe(50);
    const w = worstHistoricalScenario([{ asset: "BTC", value: 1000 }], { BTC: 70 });
    expect(w.totalLoss).toBe(700);
  });
  it("value series follows quantity held each day and flags assets without history", () => {
    const d = doc({ purchases: [buy("a", "2025-01-01", 2, 100), buy("b", "2025-01-02", 1, 10, 0, "HYPE")] });
    const { points, approximate } = valueSeries(d, { BTC: { "2025-01-01": 100, "2025-01-02": 110 } }, "2025-01-03");
    expect(points.map((p) => p.value)).toEqual([200, 230, 230]);
    expect(approximate).toEqual(["HYPE"]);
  });
});

import { calcFee, feeRatePct, formatRate } from "../investor/fees";
import { previewSale } from "../investor/calc";

describe("automatic Binance fees", () => {
  it("rates: USDT 0.10%, USDC 0.095%, 25% off with BNB", () => {
    expect(feeRatePct("USDT", false)).toBe(0.1);
    expect(feeRatePct("USDT", true)).toBe(0.075);
    expect(feeRatePct("USDC", false)).toBe(0.095);
    expect(feeRatePct("USDC", true)).toBe(0.07125);
  });
  it("fee = qty x price x rate", () => {
    expect(calcFee(2, 50_000, "USDT", false)).toBe(100);
    expect(calcFee(2, 50_000, "USDT", true)).toBe(75);
    expect(calcFee(1000, 1, "USDC", false)).toBe(0.95);
    expect(calcFee(1000, 1, "USDC", true)).toBe(0.7125);
  });
  it("is zero for invalid input, never NaN", () => {
    expect(calcFee(NaN, 1, "USDT", false)).toBe(0);
    expect(calcFee(1, -5, "USDT", false)).toBe(0);
    expect(calcFee(0, 5, "USDT", false)).toBe(0);
  });
  it("formats the rate for display", () => {
    expect(formatRate(0.1)).toBe("0.10");
    expect(formatRate(0.075)).toBe("0.075");
    expect(formatRate(0.095)).toBe("0.095");
    expect(formatRate(0.07125)).toBe("0.07125");
  });
  it("the fee flows into cost basis and realized PnL like any other fee", () => {
    const fee = calcFee(1, 100, "USDT", false); // 0.10
    const d = doc({ purchases: [buy("a", "2025-01-01", 1, 100, fee)], sales: [{ id: "s", asset: "BTC", date: "2025-02-01", qty: 1, price: 200, fee: calcFee(1, 200, "USDT", false) }] });
    const p = computePositions(d).positions.get("BTC")!;
    expect(p.realizedPnl).toBeCloseTo(200 - 0.2 - 100.1, 8);
  });
});

describe("sell preview", () => {
  const d = doc({ purchases: [buy("a", "2025-01-01", 2, 100, 0), buy("b", "2025-01-02", 2, 200, 0)] }); // avg 150, 4 held
  it("25/50/75/100% of the holding, with realized PnL net of the fee", () => {
    const fee = (q: number) => calcFee(q, 300, "USDT", false);
    for (const [pct, q] of [[25, 1], [50, 2], [75, 3], [100, 4]] as const) {
      const pv = previewSale(d, "BTC", "2025-03-01", q, 300, fee(q));
      expect(pv.held).toBe(4);
      expect(pv.exceeds).toBe(false);
      expect(pv.removedCost).toBe(150 * q);
      expect(pv.realized).toBeCloseTo(300 * q - fee(q) - 150 * q, 8);
      expect(pct).toBeGreaterThan(0);
    }
  });
  it("flags a sale larger than the holding and ignores other assets", () => {
    expect(previewSale(d, "BTC", "2025-03-01", 4.5, 300, 0).exceeds).toBe(true);
    expect(previewSale(d, "ETH", "2025-03-01", 1, 300, 0).held).toBe(0);
  });
  it("preview agrees with what the ledger records afterwards", () => {
    const pv = previewSale(d, "BTC", "2025-03-01", 1, 300, 0.3);
    const after = computePositions({ purchases: d.purchases, sales: [{ id: "s", asset: "BTC", date: "2025-03-01", qty: 1, price: 300, fee: 0.3 }] }).positions.get("BTC")!;
    expect(after.realizedPnl).toBe(pv.realized);
  });
});

describe("new document fields", () => {
  it("bnbDiscount defaults to false for older documents and is validated", () => {
    const old = { revision: 0, purchases: [], sales: [], cash: [], plans: [], manualPrices: {} };
    const r = parseDoc(old);
    expect(r.ok && r.doc.bnbDiscount).toBe(false);
    expect(parseDoc({ ...old, bnbDiscount: true })).toMatchObject({ ok: true, doc: { bnbDiscount: true } });
    expect(parseDoc({ ...old, bnbDiscount: "yes" }).ok).toBe(false);
  });
  it("accepts USDT/USDC quote and rejects anything else", () => {
    const base = { ...emptyDoc() };
    expect(parseDoc({ ...base, purchases: [{ ...buy("a", "2025-01-01", 1, 1), quote: "USDC" }] }).ok).toBe(true);
    expect(parseDoc({ ...base, purchases: [{ ...buy("a", "2025-01-01", 1, 1), quote: "EUR" }] }).ok).toBe(false);
    expect(parseDoc({ ...base, sales: [{ ...buy("s", "2025-01-01", 1, 1), quote: "EUR" }] }).ok).toBe(false);
  });
});
