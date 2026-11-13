import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("Dashboard Investor overview", () => {
  const src = read("components/investor/InvestorOverview.tsx");
  it("uses the same calculation as the Investor page, from the user's own private document", () => {
    expect(src).toContain("summarize(doc, resolvePrices(live, doc.manualPrices))");
    expect(src).toContain("useInvestor"); // fetches /api/me/investor (session enforced server-side)
    expect(read("components/investor/useInvestor.ts")).toContain("/api/me/investor");
  });
  it("shows nothing without a session and never mixes in journal data", () => {
    expect(src).toMatch(/state === "loading" \|\| state === "unauth"\) return null/);
    expect(src).not.toMatch(/@\/lib\/journal|computeDashboard|loadTrades/);
  });
  it("covers invested, value, P/L, ROI, allocation and links to the full dashboard", () => {
    for (const k of ["investor.invested", "investor.value", "investor.unrealized", "investor.roi", "investor.allocation"]) expect(src).toContain(k);
    expect(src).toContain('href="/investor"');
  });
  it("sits on the Dashboard after the trading overview, leaving it in place", () => {
    const j = read("app/journal/page.tsx");
    expect(j.indexOf("<Overview")).toBeGreaterThan(-1);
    expect(j.indexOf("<InvestorOverview />")).toBeGreaterThan(j.indexOf("<Overview"));
  });
  it("the PDF button lives on the Investor dashboard tab and has EN/FR/AR labels", () => {
    expect(read("components/investor/Dashboard.tsx")).toContain("downloadInvestorPdf");
    expect((read("lib/i18nInvestor.ts").match(/downloadPdf:/g) || []).length).toBe(3);
  });
});

describe("Academy 1-on-1 plan", () => {
  const src = read("components/academy/OneOnOnePlan.tsx");
  it("price, curriculum and a single WhatsApp-only CTA using the existing link", () => {
    expect(src).toContain("usdt: 50"); expect(src).toContain("mru: 800");
    expect(src).toContain("Technical analysis"); expect(src).toContain("Risk management and trade planning");
    expect((src.match(/<a /g) || []).length).toBe(1);
    expect(src).toContain("whatsappUrl");
    expect(src).not.toMatch(/wa\.me|https?:\/\//); // no link or number invented here
    expect(src).not.toMatch(/Bankily|Masrivi|Sedad|\/api\/payments/);
  });
  it("the Academy page passes its existing WhatsApp constant", () => {
    const a = read("components/academy/AcademyIndex.tsx");
    expect(a).toContain("<OneOnOnePlan whatsappUrl={WHATSAPP_URL} />");
    expect(a).toMatch(/const WHATSAPP_URL = /);
  });
});

describe("Market Pulse rename and homepage text", () => {
  const i18n = read("lib/i18n.tsx");
  it("the feature is named Market Pulse in the navigation in every language", () => {
    expect((i18n.match(/marketIntel: "Market Pulse"/g) || []).length).toBe(2);
    expect(i18n).toContain('marketIntel: "نبض السوق"');
    expect(i18n).not.toMatch(/marketIntel: "Market Intelligence"/);
  });
  it("the homepage paragraph is the exact requested text", () => {
    expect(i18n).toContain("Atlas Trading is an all-in-one crypto trading ecosystem combining AI-powered analysis, market intelligence, opportunity discovery, trade planning, Binance Spot execution workflows, risk management, and portfolio tracking — all in one platform.");
  });
});

describe("Share page", () => {
  it("shows reused virtual phones and keeps the card builder and downloads", () => {
    const p = read("components/share/SharePhones.tsx");
    expect(p).toContain('from "@/components/home/HeroPhone"'); expect(p).toContain('from "@/components/home/InvestorPhone"');
    const page = read("app/share/page.tsx");
    expect(page).toContain("<SharePhones"); expect(page).toContain("<PromoCard"); expect(page).toContain("toBlob");
  });
});

describe("Radar Worth watching cards", () => {
  it("keeps the shortlist logic and filters; only presentation changed", () => {
    const r = read("app/radar/page.tsx");
    expect(r).toContain('r.tags.includes("outperformBtc") && r.tags.includes("highVolume")');
    expect(r).toContain("SHORTLIST_SIZE"); expect(r).toContain("aria-pressed={active}");
  });
});
