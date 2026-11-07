// NAV-TRADE-MGMT-v1: structure of the main navigation and the new links (source-level checks; no browser here).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const nav = readFileSync("components/Nav.tsx", "utf8");
const i18n = readFileSync("lib/i18n.tsx", "utf8");
const feed = readFileSync("app/trade-feed/page.tsx", "utf8");

describe("Simplified navigation (WORKFLOW-v1)", () => {
  it("Home links to the public homepage and comes before Dashboard, as a visible link on desktop and mobile", () => {
    expect(nav).toContain('href: "/",\n    icon:');
    expect(nav).toContain('t("nav.home")');
    expect(nav).toContain("const COMMAND_LINKS = [homeLink, dashLink, workflowLink];");
    expect(nav).toContain("{[homeLink, dashLink, workflowLink].map((link) => (");
    expect(i18n.match(/    home: "/g)?.length).toBeGreaterThanOrEqual(3);
  });
  it("shows Dashboard, Workflow, Markets and Academy", () => {
    for (const k of ["nav.dashboard", "nav.workflow", "nav.markets", "nav.academy"]) expect(nav).toContain(`t("${k}")`);
    expect(nav).toContain('href: "/workflow"');
    expect(nav).toContain('href: "/journal", icon');
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
    for (const k of ["dashboard", "workflow", "markets"]) expect(i18n.match(new RegExp(`    ${k}: "`, "g"))?.length).toBeGreaterThanOrEqual(3);
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
