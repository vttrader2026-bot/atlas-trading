// WEBSITE-FIXES-v1: Publish to Feed stays available to the owner, ticker removed, Explore Atlas goes to /workflow.
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { validateSpotSetup } from "@/lib/ownerPublish";

const read = (f: string) => readFileSync(f, "utf8");
const strip = (s: string) => s.replace(/^\s*(\/\/|\{?\/\*).*$/gm, "");

describe("1. Publish to Feed (Trade Plan)", () => {
  const page = read("app/trade-plan/page.tsx");
  const i = page.indexOf("<PublishToFeedButton");
  const block = page.slice(i, page.indexOf("/>", page.indexOf("setup=", i)) + 2);
  it("is rendered unconditionally in the Trade Plan action row (not inside the sent / entered / journal branches)", () => {
    expect(i).toBeGreaterThan(0);
    const before = page.slice(page.lastIndexOf('<div className="mt-6 flex flex-wrap gap-3">', i), i);
    // the only conditional before it is the Send-to-Journal / Open-in-Journal pair, which is closed before the button
    expect(before).toContain("{sent ? (");
    expect(before.indexOf(")}")).toBeGreaterThan(before.indexOf("{sent ? ("));
    expect(page.slice(page.lastIndexOf("{sent ? (", i), i)).toMatch(/\)\}\s*(\{\/\*[\s\S]*\*\/\}\s*)?$/);
  });
  it("asks to stay visible for the owner (disabled with the reason) instead of silently disappearing", () => {
    expect(block).toContain("showWhenInvalid");
    const btn = read("components/feed/PublishToFeedButton.tsx");
    expect(btn).toContain("data-publish-invalid");
    expect(btn).toContain("if (!owner) return null;");
  });
  it("the published setup is built only from the plan's levels, never from its confirmation or Journal state", () => {
    expect(block).not.toMatch(/status|entered|journalId|actualEntry|enteredAt|actualQty|sent\b|journalHas/);
  });
  it("a plan's setup validates the same whatever its lifecycle fields say", () => {
    const base = { pair: "SOLUSDT", direction: "Long", timeframe: "4H", entryZone: "100 - 102", invalidation: "95", tp1: "110", tp2: "120", tp3: "130", reasoning: "r" };
    const lifecycle = [{}, { status: "entered", actualEntry: "101", enteredAt: "2026-11-01", journalId: "j1" }, { status: "draft", journalId: "j2", actualQty: "3", manualFill: true }];
    const results = lifecycle.map((x) => JSON.stringify(validateSpotSetup({ ...base, ...x })));
    expect(new Set(results).size).toBe(1);
    expect(JSON.parse(results[0]).ok).toBe(true);
  });
  it("publishing never confirms a trade or touches the Journal: the button and the route do not reference them", () => {
    const btn = strip(read("components/feed/PublishToFeedButton.tsx"));
    expect(btn).not.toMatch(/journal|confirmEntry|confirmPlan|saveTrades|loadTrades|eliteConfirm|\/api\/me\//i);
    expect(btn).toContain("/api/admin/signals/quick-publish");
    const route = strip(read("app/api/admin/signals/quick-publish/route.ts"));
    expect(route).not.toMatch(/journal|CONFIRM_COUNTS_KEY|confirm-trade|eliteConfirm|clerkClient/i);
  });
  it("the owner-only rules are unchanged: hidden for members, server re-checks", () => {
    expect(read("components/feed/PublishToFeedButton.tsx")).toContain("useIsOwner()");
    expect(read("app/api/admin/signals/quick-publish/route.ts")).toContain("requireOwner");
  });
});

describe("2. Homepage ticker", () => {
  it("the scrolling ticker strip is no longer rendered anywhere in the layout or pages", () => {
    expect(read("app/layout.tsx")).not.toMatch(/TickerStrip/);
    expect(read("app/page.tsx")).not.toMatch(/TickerStrip|marquee/);
  });
  it("market data used elsewhere is intact (live tickers hook, /ticker page, Radar, Investor)", () => {
    expect(existsSync("lib/useLiveTickers.ts")).toBe(true);
    expect(existsSync("app/ticker/page.tsx")).toBe(true);
    expect(read("app/radar/page.tsx")).toContain("useLiveTickers");
  });
});

describe("5. Explore Atlas", () => {
  it("the homepage button opens /workflow, with its EN/FR/AR label unchanged, and no Discover page exists", () => {
    const page = read("app/page.tsx");
    expect(page).toMatch(/<Link href="\/workflow"[^>]*>\{t\("homeV2\.hero\.exploreCta"\)\}<\/Link>/);
    expect(page).not.toMatch(/<Link href="\/radar"[^>]*>\{t\("homeV2\.hero\.exploreCta"\)/);
    expect(existsSync("app/discover")).toBe(false);
    expect(existsSync("app/workflow/page.tsx")).toBe(true);
    const i18n = read("lib/i18n.tsx");
    for (const v of ['exploreCta: "Explore Atlas"', 'exploreCta: "استكشف أطلس"', 'exploreCta: "Découvrir Atlas"']) expect(i18n).toContain(v);
  });
});
