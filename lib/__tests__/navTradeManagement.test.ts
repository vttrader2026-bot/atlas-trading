// NAV-TRADE-MGMT-v1: structure of the main navigation and the new links (source-level checks; no browser here).
import { i18nSource } from "./helpers/i18nSource";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const nav = readFileSync("components/Nav.tsx", "utf8");
const i18n = i18nSource();
const feed = readFileSync("app/trade-feed/page.tsx", "utf8");

describe("Simplified navigation (WORKFLOW-v1)", () => {
  it("Home links to the public homepage and comes first, as a visible link on desktop and mobile", () => {
    // Whitespace-tolerant (LF or CRLF): homeLink = { href: "/", icon: ..., label: t("nav.home") }
    expect(nav).toMatch(/const homeLink = \{\s*href: "\/",\s*icon:[\s\S]*?label: t\("nav\.home"\)/);
    expect(nav).toContain('t("nav.home")');
    expect(nav).toContain("const COMMAND_LINKS = [investorLink];");
    expect(nav).toContain("homeLink.href");
    expect(i18n.match(/    home: "/g)?.length).toBeGreaterThanOrEqual(3);
  });
  it("NAV-WEBSITE-FIXES: shows Home, Trading, Investor, Markets and Academy; Dashboard and Workflow are gone from the main navigation", () => {
    for (const k of ["nav.home", "nav.trading", "nav.investor", "nav.markets", "nav.academy"]) expect(nav).toContain(`t("${k}")`);
    expect(nav).not.toContain('t("nav.dashboard")');
    expect(nav).not.toContain('t("nav.workflow")');
    expect(nav).not.toContain('href: "/workflow"');
    expect(readFileSync("app/workflow/page.tsx", "utf8").length).toBeGreaterThan(100); // the page itself stays
  });
  it("Trading is a dropdown with Trade Feed, Trade Plan, Journal and Performance (desktop and mobile), in that order", () => {
    const m = nav.match(/const TRADING = \[([\s\S]*?)\];/);
    expect(m).not.toBeNull();
    expect([...m![1].matchAll(/href: "([^"]+)"/g)].map((x) => x[1])).toEqual(["/trade-feed", "/trade-plan", "/journal", "/performance"]);
    for (const k of ["nav.tradeFeed", "nav.tradePlan", "nav.journal", "nav.performance"]) expect(m![1]).toContain(`t("${k}")`);
    expect(nav).toContain('<DropdownMenu label={t("nav.trading")} items={TRADING}');
    expect(nav).toContain("setTrOpen");
    expect(i18n.match(/    trading: "/g)?.length).toBe(3);
  });
  it("Markets groups Radar, Market Intelligence and Watchlist", () => {
    for (const href of ["/radar", "/market-intelligence", "/watchlist"]) expect(nav).toContain(`{ href: "${href}", label:`);
  });
  it("Markets is a dropdown on desktop (menu semantics, Escape / outside click) and a group on mobile", () => {
    expect(nav).toContain("DropdownMenu");
    for (const needle of ['aria-haspopup="menu"', 'role="menu"', 'role="menuitem"', '"Escape"', "mousedown"]) expect(nav).toContain(needle);
    expect(nav).toContain("setMkOpen");
  });
  it("keeps the Elite link, account controls and RTL-aware menu placement", () => {
    expect(nav).toContain('href="/elite"');
    expect(nav).toContain('document.documentElement.dir === "rtl"');
  });
  it("is labelled in English, Arabic and French", () => {
    for (const k of ["dashboard", "workflow", "markets", "trading"]) expect(i18n.match(new RegExp(`    ${k}: "`, "g"))?.length).toBeGreaterThanOrEqual(3);
    expect(i18n.match(/tradeManagement: "/g)?.length).toBe(3);
  });
});

describe("Trade Feed -> My Journal", () => {
  it("links straight to /journal for signed-in users", () => {
    expect(feed).toContain('href="/journal"');
    expect(feed).toContain('t("tradeFeed.myJournal")');
    expect(feed).toMatch(/isLoaded && isSignedIn && \(\s*<Link href="\/journal"/);
  });
});
