import { describe, it, expect } from "vitest";
import { emptyDoc, type InvestorDoc } from "@/lib/investor/model";
import { resolvePrices, summarize } from "@/lib/investor/calc";
import { buildInvestorReport, renderInvestorPdf } from "@/lib/investorPdf";

const fmt = { currency: "USDT", money: (n: number) => `$${n.toFixed(2)}`, signed: (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`, price: (n: number) => `$${n}` };
const doc = (): InvestorDoc => ({
  ...emptyDoc(),
  purchases: [
    { id: "p1", asset: "BTC", date: "2026-01-10", qty: 0.1, price: 50000, fee: 5 },
    { id: "p2", asset: "ETH", date: "2026-02-10", qty: 2, price: 2000, fee: 4 },
  ],
  sales: [{ id: "s1", asset: "BTC", date: "2026-03-01", qty: 0.02, price: 60000, fee: 1 }],
  cash: [{ id: "c1", date: "2026-01-01", type: "deposit", amount: 20000 }],
});
const live = { BTCUSDT: { lastPrice: "70000" } } as never; // ETH has no price on purpose

describe("Investor PDF report", () => {
  const d = doc();
  const s = summarize(d, resolvePrices({ BTCUSDT: { lastPrice: "70000" } } as never, d.manualPrices));
  const r = buildInvestorReport(d, s, fmt);
  void live;

  it("summary numbers are exactly the dashboard's summarize() numbers", () => {
    const get = (l: string) => r.summary.find((x) => x.label.startsWith(l))?.value;
    expect(get("Total invested")).toBe(fmt.money(s.invested));
    expect(get("Current portfolio value")).toBe(fmt.money(s.value));
    expect(get("Unrealized")).toBe(fmt.signed(s.unrealized));
    expect(get("Realized")).toBe(fmt.signed(s.realized));
    expect(get("Total bought")).toBe(fmt.money(s.totalBought));
    expect(get("ROI")).toBe(`${s.roiPct && s.roiPct > 0 ? "+" : ""}${(s.roiPct as number).toFixed(2)}%`);
  });
  it("never invents a figure for an asset without a price", () => {
    const eth = r.holdings.find((h) => h.Asset.startsWith("ETH"))!;
    expect(eth.Price).toBe("-"); expect(eth.Value).toBe("-"); expect(eth["P/L"]).toBe("-"); expect(eth.ROI).toBe("-");
    expect(r.allocation.map((a) => a.asset)).toEqual(["BTC"]);
    expect(r.notes.join(" ")).toMatch(/No price available for ETH/);
  });
  it("lists every holding and every transaction (buys and sells), newest first, with cash entries", () => {
    expect(r.holdings).toHaveLength(2);
    expect(r.transactions.map((t) => t.Type + t.Asset)).toEqual(["SellBTC", "BuyETH", "BuyBTC"]);
    expect(r.cash).toEqual([{ Date: "2026-01-01", Type: "Deposit", Amount: "$20000.00" }]);
  });
  it("an empty portfolio is a real zero, not unknown", () => {
    const e = emptyDoc(); const es = summarize(e, {});
    const er = buildInvestorReport(e, es, fmt);
    expect(er.summary.find((x) => x.label.startsWith("Current portfolio value"))?.value).toBe("$0.00");
    expect(er.holdings).toEqual([]); expect(er.transactions).toEqual([]);
  });
  it("only uses the document it is given and leaves free-text notes out", () => {
    const n = doc(); n.purchases[0].note = "private note";
    expect(JSON.stringify(buildInvestorReport(n, summarize(n, {}), fmt))).not.toContain("private note");
  });
  it("renders a real, multi-page capable PDF", async () => {
    const big = doc();
    for (let i = 0; i < 120; i++) big.purchases.push({ id: `x${i}`, asset: "BTC", date: "2026-01-11", qty: 0.001, price: 50000, fee: 0 });
    const pdf = await renderInvestorPdf(big, summarize(big, {}), fmt, new Date("2026-11-13T00:00:00Z"));
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(new TextDecoder().decode(new Uint8Array(pdf.output("arraybuffer")).slice(0, 5))).toBe("%PDF-");
  });
});
