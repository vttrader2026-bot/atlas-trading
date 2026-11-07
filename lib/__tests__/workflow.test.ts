// WORKFLOW-v1: real progress only, six steps, no locks, default landing, translations.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dictionaries } from "@/lib/i18n";
import { computeWorkflowProgress } from "@/lib/workflowProgress";
import type { Trade } from "@/lib/journal";

type Dict = { [k: string]: string | Dict };
const flat = (d: Dict, prefix = ""): Record<string, string> =>
  Object.entries(d).reduce((acc, [k, v]) => (typeof v === "string" ? { ...acc, [`${prefix}${k}`]: v } : { ...acc, ...flat(v, `${prefix}${k}.`) }), {});

const trade = (over: Partial<Trade>): Trade =>
  ({ id: Math.random().toString(), symbol: "BTCUSDT", side: "Long", entry: 100, size: 1, status: "open", exit: null, ...over }) as unknown as Trade;

describe("workflow progress", () => {
  it("is empty with no data: a plan draft alone is not an execution", () => {
    const p = computeWorkflowProgress({ watchlistCount: null, analysisCount: 0, hasPlanDraft: true, trades: [] });
    expect(p.planInProgress).toBe(true);
    expect(p.executed).toBe(0);
    expect(p.open).toBe(0);
    expect(p.closed).toBe(0);
  });
  it("Manage counts open trades only and Review counts completed trades only", () => {
    const p = computeWorkflowProgress({
      watchlistCount: 3,
      analysisCount: 2,
      hasPlanDraft: false,
      trades: [trade({ status: "open" }), trade({ status: "open" }), trade({ status: "closed", exit: 110 })],
    });
    expect(p.open).toBe(2);
    expect(p.closed).toBe(1);
    expect(p.executed).toBe(3);
    expect(p.watchlist).toBe(3);
    expect(p.analyses).toBe(2);
  });
});

describe("workflow page and navigation wiring", () => {
  const page = readFileSync("app/workflow/page.tsx", "utf8");
  const layout = readFileSync("app/layout.tsx", "utf8");
  it("renders all six steps in order with no locked state", () => {
    const order = ["discover", "analyze", "plan", "execute", "manage", "review"].map((k) => page.indexOf(`key: "${k}"`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(page).not.toMatch(/disabled|locked|aria-disabled/);
  });
  it("derives activity only from saved data, never from clicks", () => {
    expect(page).not.toMatch(/onClick/);
    expect(page).toContain("computeWorkflowProgress");
    expect(page).toContain("showActivity");
  });
  it("makes /workflow the post-login landing page without changing the homepage", () => {
    expect(layout).toContain('signInFallbackRedirectUrl="/workflow"');
    expect(layout).toContain('signUpFallbackRedirectUrl="/workflow"');
  });
});

describe("workflow translations", () => {
  const en = flat(dictionaries.en.workflow as Dict);
  it("EN, AR and FR have identical keys, none empty", () => {
    for (const l of ["ar", "fr"] as const) {
      const d = flat(dictionaries[l].workflow as Dict);
      expect(Object.keys(d).sort()).toEqual(Object.keys(en).sort());
      expect(Object.values(d).every((v) => v.trim().length > 0)).toBe(true);
    }
    expect(Object.keys(en).length).toBeGreaterThan(30);
  });
  it("keeps the {n} placeholder in every language", () => {
    for (const l of ["en", "ar", "fr"] as const) expect(flat(dictionaries[l].workflow as Dict)["status.open"]).toContain("{n}");
  });
});
