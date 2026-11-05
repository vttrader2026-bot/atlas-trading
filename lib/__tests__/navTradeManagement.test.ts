// NAV-TRADE-MGMT-v1: structure of the main navigation and the new links (source-level checks; no browser here).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const nav = readFileSync("components/Nav.tsx", "utf8");
const i18n = readFileSync("lib/i18n.tsx", "utf8");
const feed = readFileSync("app/trade-feed/page.tsx", "utf8");

describe("Trade Management navigation", () => {
  it("groups Trade Plan, Journal and Risk Calculator, keeping their routes", () => {
    expect(nav).toContain('{ href: "/trade-plan", label: t("nav.tradePlan") }');
    expect(nav).toContain('{ href: "/journal", label: t("nav.journal") }');
    expect(nav).toContain('{ href: "/risk", label: t("nav.riskCalculator") }');
  });
  it("is a dropdown on desktop (menu semantics, Escape / outside click) and a group on mobile", () => {
    expect(nav).toContain("TradeManagementMenu");
    for (const needle of ['aria-haspopup="menu"', 'role="menu"', 'role="menuitem"', '"Escape"', "mousedown"]) expect(nav).toContain(needle);
    expect(nav).toContain("setTmOpen"); // mobile accordion
  });
  it("the three tools are no longer separate mobile links", () => {
    const mobile = nav.slice(nav.indexOf("const MOBILE_GROUPS"), nav.indexOf("const eliteLabel"));
    for (const href of ["/trade-plan", "/journal", "/risk"]) expect(mobile).not.toContain(`href: "${href}"`);
  });
  it("is labelled in English, Arabic and French", () => {
    expect(i18n.match(/tradeManagement: "/g)?.length).toBe(3);
    expect(i18n.match(/riskCalculator: "/g)?.length).toBe(3);
    expect(i18n).toContain('tradeManagement: "Trade Management"');
  });
});

describe("Trade Feed -> My Journal", () => {
  it("links straight to /journal for signed-in users", () => {
    expect(feed).toContain('href="/journal"');
    expect(feed).toContain('t("tradeFeed.myJournal")');
    expect(feed).toMatch(/isLoaded && isSignedIn && \(\s*<Link href="\/journal"/);
  });
});
