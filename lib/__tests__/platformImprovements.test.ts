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
    expect(src).toContain('ONE_ON_ONE_WHATSAPP_URL = "https://wa.me/message/U4BSGXSUARE7P1"');
    expect(src).toContain("href={ONE_ON_ONE_WHATSAPP_URL}");
    expect(src).not.toMatch(/chat\.whatsapp\.com/); // the group invitation is not used for 1-on-1
    expect((src.match(/https?:\/\//g) || []).length).toBe(1);
    expect(src.match(/private/gi)?.length).toBeGreaterThanOrEqual(4); // EN/FR use "private"/"privé"; checked below
    expect(src).toMatch(/message privé/); expect(src).toMatch(/رسالة واتساب خاصة/); expect(src).toMatch(/It is not a group/);
    expect(src).not.toMatch(/Bankily|Masrivi|Sedad|\/api\/payments/);
  });
  it("the group link stays for the community section only, not passed to the 1-on-1 plan", () => {
    const a = read("components/academy/AcademyIndex.tsx");
    expect(a).toContain("<OneOnOnePlan />");
    expect(a).toMatch(/const WHATSAPP_URL = "https:\/\/chat\.whatsapp\.com/);
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
    expect(page).not.toContain("ScaledPreview"); expect(page).not.toContain("previewSize");
    expect(page).toContain('run(size, "download")'); expect(page).toContain('run(size, "share")'); expect(page).toContain("ref={refs[size]}");
  });
});

describe("Radar Worth watching cards", () => {
  it("keeps the shortlist logic and filters; only presentation changed", () => {
    const r = read("app/radar/page.tsx");
    expect(r).toContain('r.tags.includes("outperformBtc") && r.tags.includes("highVolume")');
    expect(r).toContain("SHORTLIST_SIZE"); expect(r).toContain("aria-pressed={active}");
  });
});
