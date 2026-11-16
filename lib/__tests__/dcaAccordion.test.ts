// DCA-ACCORDION-v1: the DCA Planner shows plans as collapsed accordion rows. UI only: no calculation, API, storage or membership change.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

vi.mock("@/lib/i18n", async () => {
  const { dcaLimitsEn } = await import("@/lib/i18nDcaLimits");
  return { useLanguage: () => ({ lang: "en", t: (k: string) => (k.startsWith("dcaLimits.") ? (dcaLimitsEn as Record<string, string>)[k.slice(10)] ?? k : k) }) };
});

import Dca from "@/components/investor/Dca";
import { dcaLimitsAr, dcaLimitsEn, dcaLimitsFr } from "@/lib/i18nDcaLimits";
import type { DcaPlan, InvestorDoc, Purchase } from "@/lib/investor/model";
import { planSlotKeys } from "@/lib/investor/dca";

let n = 0;
const plan = (o: Partial<DcaPlan> = {}): DcaPlan => ({ id: `p${++n}`, name: `Plan ${n}`, asset: "ADA", budget: 1000, initial: 100, recurring: { amount: 50, frequency: "monthly", startDate: "2025-01-01", count: 2 }, dips: [], refPrice: 1, createdAt: "2025-01-01T00:00:00.000Z", ...o });
const buy = (p: DcaPlan, slot: string): Purchase => ({ id: `b${++n}`, asset: p.asset, date: "2025-01-02", qty: 10, price: 1, fee: 0, planId: p.id, slot });
const doc = (plans: DcaPlan[], purchases: Purchase[] = []): InvestorDoc => ({ ...( { purchases, sales: [], cash: [], plans, manualPrices: {}, revision: 1 } as unknown as InvestorDoc) });
const render = (d: InvestorDoc) => renderToStaticMarkup(createElement(Dca, { doc: d, prices: {}, run: async () => true, onRecord: () => {}, limit: 2, active: 1 }));

describe("DCA accordion: default state", () => {
  const active = plan({ name: "Alpha" });
  const done = plan({ name: "Done plan" });
  const closed = plan({ name: "Closed plan", closedAt: "2025-02-01T00:00:00.000Z" });
  const d = doc([active, done, closed], [...planSlotKeys(done).map((k) => buy(done, k)), buy(active, planSlotKeys(active)[0])]);
  const html = render(d);

  it("every plan renders as a collapsed row (aria-expanded=false) and no plan body is mounted", () => {
    expect((html.match(/aria-expanded="false"/g) || []).length).toBe(3);
    expect(html).not.toContain('aria-expanded="true"');
    expect(html).not.toMatch(/id="dca-plan-/);              // no expanded panel
    expect(html).not.toContain("investor.schedule");          // schedule heading is part of the expanded body
    expect(html).not.toContain("investor.record");            // Record buttons live in the expanded body
    expect(html).not.toContain("dcaLimits.close");            // Close/Restore/Delete live in the expanded body
  });
  it("collapsed rows show pair, status, progress (completed/total) and total invested", () => {
    for (const name of ["Alpha", "Done plan", "Closed plan"]) expect(html).toContain(name);
    expect(html).toContain("ADA");
    expect(html).toContain(">Active<");
    expect(html).toContain(">Completed<");
    expect(html).toContain(">Closed<");
    // each plan has 3 steps (initial + 2 recurring): done/total and the amount invested so far (10 per recorded purchase)
    expect(html).toContain(">1/3<"); expect(html).toContain(">3/3<"); expect(html).toContain(">0/3<");
    expect(html).toContain("$10.00"); expect(html).toContain("$30.00"); expect(html).toContain("$0.00");
  });
  it("keeps the active section first and the closed/completed section after it", () => {
    expect(html.indexOf("Alpha")).toBeLessThan(html.indexOf("Closed and completed plans"));
    expect(html.indexOf("Closed and completed plans")).toBeLessThan(html.indexOf("Done plan"));
  });
});

describe("DCA accordion: source rules", () => {
  const s = readFileSync("components/investor/Dca.tsx", "utf8");
  it("only one plan can be open: a single shared id, toggled off when clicked again, starting closed", () => {
    expect(s).toContain("useState<string | null>(null)");
    expect(s).toContain("setOpenId((cur) => (cur === id ? null : id))");
    expect((s.match(/open=\{openId === p\.id\}/g) || []).length).toBe(2); // active list and closed/completed list share the same state
  });
  it("the toggle is a real button with aria-expanded and aria-controls pointing at the panel", () => {
    expect(s).toMatch(/<button type="button" aria-expanded=\{open\} aria-controls=\{panelId\}/);
    expect(s).toContain("id={panelId}");
    expect(s).toContain("{open && <div id={panelId}");
  });
  it("existing actions are still in the expanded body: Close, Restore, Delete, Record and the single Binance link", () => {
    for (const k of ["dcaLimits.close", "dcaLimits.restore", "investor.deletePlan", "onRecord({ asset: plan.asset, amount: s.amount, planId: plan.id, slot: s.key })"]) expect(s).toContain(k);
    expect((s.match(/<BinanceSpotLink/g) || []).length).toBe(1);
    expect(s.indexOf("{open && <div id={panelId}")).toBeLessThan(s.indexOf("<BinanceSpotLink"));
  });
  it("no button is nested inside the toggle button (the actions are outside the summary row)", () => {
    const summary = s.slice(s.indexOf("aria-controls={panelId}"), s.indexOf("</button>", s.indexOf("aria-controls={panelId}")));
    expect(summary).not.toContain("<button");
    expect(summary).not.toContain("<BinanceSpotLink");
  });
  it("calculations and data are untouched: no new storage, API call or limit logic", () => {
    expect(s).not.toMatch(/localStorage|sessionStorage|fetch\(/);
    expect(s).toContain("planProgress(plan, doc.purchases, today(), livePrice)");
    expect(s).toContain("PLAN_LIMITS.elite.activeDcaPlans");
  });
});

describe("DCA accordion: translations", () => {
  it("the new status label exists in EN, FR and AR with identical keys", () => {
    expect(dcaLimitsEn.stateActive).toBe("Active");
    expect(dcaLimitsFr.stateActive).toBeTruthy();
    expect(dcaLimitsAr.stateActive).toBeTruthy();
    expect(Object.keys(dcaLimitsFr).sort()).toEqual(Object.keys(dcaLimitsEn).sort());
    expect(Object.keys(dcaLimitsAr).sort()).toEqual(Object.keys(dcaLimitsEn).sort());
  });
});
