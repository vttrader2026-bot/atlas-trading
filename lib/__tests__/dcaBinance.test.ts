import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { DcaPlan, Purchase } from "@/lib/investor/model";
import { planProgress, slotPurchase, withPlanPurchase } from "@/lib/investor/dca";

const plan: DcaPlan = { id: "pl1", name: "BTC", asset: "BTC", budget: 1000, initial: 100, recurring: { amount: 100, frequency: "monthly", startDate: "2026-01-01", count: 3 }, dips: [{ dropPct: 10, amount: 200 }], refPrice: 50000, createdAt: "2026-01-01" };
const buy = (id: string, slot: string, qty: number, price: number, fee = 0): Purchase => ({ id, asset: "BTC", date: "2026-01-02", qty, price, fee, planId: "pl1", slot });

describe("DCA calculations", () => {
  it("average entry = total cost incl. fees / total quantity", () => {
    const pr = planProgress(plan, [buy("a", "initial", 0.002, 50000, 1), buy("b", "r1", 0.004, 25000, 1)], "2026-02-01", 30000);
    expect(pr.spent).toBe(202); expect(pr.qty).toBe(0.006);
    expect(pr.avgEntry).toBeCloseTo(202 / 0.006, 6);
  });
  it("no purchases means no average entry (never invented)", () => {
    const pr = planProgress(plan, [], "2026-02-01", 30000);
    expect(pr.avgEntry).toBeNull(); expect(pr.qty).toBe(0);
  });
  it("planned slots: initial, recurring and dip trigger price", () => {
    const pr = planProgress(plan, [], "2026-01-01", null);
    expect(pr.slots.map((s) => s.key)).toEqual(["initial", "r1", "r2", "r3", "d1"]);
    expect(pr.slots.find((s) => s.key === "d1")?.triggerPrice).toBe(45000);
  });
});

describe("no duplicate DCA transactions", () => {
  it("recording the same slot twice updates the one purchase", () => {
    const first = withPlanPurchase([], buy("a", "r1", 0.002, 50000));
    const again = withPlanPurchase(first, buy("zzz", "r1", 0.0021, 49000));
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ id: "a", qty: 0.0021, price: 49000 });
    expect(slotPurchase(again, "pl1", "r1")?.id).toBe("a");
  });
  it("different slots, and non-plan purchases, are separate transactions", () => {
    let l = withPlanPurchase([], buy("a", "r1", 1, 1));
    l = withPlanPurchase(l, buy("b", "r2", 1, 1));
    l = withPlanPurchase(l, { id: "c", asset: "BTC", date: "2026-01-02", qty: 1, price: 1, fee: 0 });
    expect(l.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("editing an existing purchase keeps its id and count", () => {
    const l = withPlanPurchase([buy("a", "r1", 1, 1)], buy("a", "r1", 2, 2));
    expect(l).toHaveLength(1); expect(l[0].qty).toBe(2);
  });
  it("a recorded slot is done and counts once in spent", () => {
    const l = withPlanPurchase(withPlanPurchase([], buy("a", "r1", 1, 100)), buy("b", "r1", 1, 100));
    const pr = planProgress(plan, l, "2026-06-01", null);
    expect(pr.slots.find((s) => s.key === "r1")?.status).toBe("done"); expect(pr.spent).toBe(100);
  });
});

describe("Binance manual handoff stays manual", () => {
  const dca = readFileSync("components/investor/Dca.tsx", "utf8");
  const link = readFileSync("components/BinanceSpotLink.tsx", "utf8");
  it("DCA only opens the Binance Spot page via the existing link component", () => {
    expect(dca).toContain("BinanceSpotLink");
    expect(dca).toMatch(/pair=\{`\$\{plan\.asset\}\/USDT`\}/);
  });
  it("exactly one Binance button per plan, in the plan header, never inside a step row", () => {
    expect((dca.match(/<BinanceSpotLink/g) || []).length).toBe(1);
    const header = dca.slice(dca.indexOf("<CoinLogo base={plan.asset}"), dca.indexOf("grid grid-cols-2 sm:grid-cols-4"));
    expect(header).toContain("<BinanceSpotLink");
    const steps = dca.slice(dca.indexOf("pr.slots.map"), dca.indexOf("pr.history.length"));
    expect(steps).not.toContain("BinanceSpotLink");
    expect(steps).toContain('onRecord({ asset: plan.asset, amount: s.amount, planId: plan.id, slot: s.key })'); // manual recording kept
  });
  it("the link is a plain anchor: no click handler, no API call, nothing recorded when it is opened", () => {
    expect(link).not.toMatch(/onClick|fetch\(|run\(|commit\(/);
    expect(link).toContain('rel="noopener noreferrer"');
  });
  it("records change only through the explicit Record button and the form's Save", () => {
    expect((dca.match(/onRecord\(/g) || []).length).toBe(1);
    expect(dca).not.toMatch(/api\.binance|\/api\/v3\/order|apiKey|withdraw|transfer/i);
  });
  it("tells the user Binance is manual and opening it records nothing (EN/FR/AR)", () => {
    const i18n = readFileSync("lib/i18nInvestor.ts", "utf8");
    expect((i18n.match(/dcaBinanceNote:/g) || []).length).toBe(3);
    expect(i18n).toMatch(/Opening Binance does not record anything/);
  });
});
