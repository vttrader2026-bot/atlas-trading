// INVESTOR-v1: translations, navigation scope, and UI wiring.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { investorAr, investorEn, investorFr } from "@/lib/i18nInvestor";
import { INVESTOR_ASSETS } from "@/lib/investor/assets";
import { resolvePrices } from "@/lib/investor/calc";

const keys = (o: object) => Object.keys(o).sort();
const read = (f: string) => readFileSync(f, "utf8");
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));

describe("investor translations", () => {
  it("EN, FR and AR have identical keys and no empty strings", () => {
    expect(keys(investorFr)).toEqual(keys(investorEn));
    expect(keys(investorAr)).toEqual(keys(investorEn));
    for (const d of [investorEn, investorFr, investorAr]) for (const v of Object.values(d)) expect(v.trim()).not.toBe("");
  });
  it("placeholders match across languages", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of keys(investorEn)) {
      const en = investorEn[k as keyof typeof investorEn];
      expect(ph(investorFr[k as keyof typeof investorFr]), k).toBe(ph(en));
      expect(ph(investorAr[k as keyof typeof investorAr]), k).toBe(ph(en));
    }
  });
  it("is merged into every language of lib/i18n.tsx", () => {
    const src = read("lib/i18n.tsx");
    for (const v of ["investorEn", "investorFr", "investorAr"]) expect(src).toContain(`investor: { ...${v} }`);
  });
  it("risk and manual-price wording stays honest", () => {
    expect(investorEn.riskDisclaimer).toMatch(/not predictions and not guarantees/i);
    expect(investorEn.disclaimer).toMatch(/never places orders/i);
    expect(investorEn.manual).toBe("Manual");
    expect(investorEn.live).toMatch(/Binance/);
  });
});

describe("navigation", () => {
  it("keeps the Footer and Workflow links", () => {
    expect(read("components/Footer.tsx")).toContain('href: "/investor"');
    expect(read("app/workflow/page.tsx")).toContain('href="/investor"');
  });
  it("main nav has Investor between Workflow and Markets, on desktop and in the mobile menu, with every other item kept", () => {
    const nav = read("components/Nav.tsx");
    expect(nav).toContain('href: "/investor"');
    expect(nav).toContain('t("nav.investor")');
    expect(nav).toContain("const COMMAND_LINKS = [homeLink, dashLink, workflowLink, investorLink];");
    expect(nav).toMatch(/COMMAND_LINKS\.map\(\(link\) => \(\s*<CommandNavLink/); // desktop
    expect(nav).toMatch(/COMMAND_LINKS\.map\(\(link\) => \(\s*<Link key/); // mobile menu
    for (const k of ["nav.home", "nav.dashboard", "nav.workflow", "nav.markets", "nav.academy"]) expect(nav).toContain(`t("${k}")`);
  });
  it("is translated in EN, FR and AR", () => {
    const i18n = read("lib/i18n.tsx");
    for (const v of ['investor: "Investor"', 'investor: "Investisseur"', 'investor: "المستثمر"']) expect(i18n).toContain(v);
  });
  it("is still absent from the sitemap (private page)", () => expect(read("app/sitemap.ts")).not.toMatch(/investor/i));
});

describe("assets and prices in the UI", () => {
  it("picker is fed by the 17 supported assets only", () => {
    expect(read("components/investor/AssetPicker.tsx")).toContain("searchAssets");
    expect(INVESTOR_ASSETS.map((a) => a.ticker)).toContain("HYPE");
    expect(INVESTOR_ASSETS.map((a) => a.ticker)).toContain("ADA");
  });
  it("a coin Binance does not list falls back to a labelled manual price, never a silent zero", () => {
    const p = resolvePrices({}, { HYPE: { price: 41.5, at: "2026-11-08T00:00:00Z" } });
    expect(p.HYPE).toMatchObject({ source: "manual", price: 41.5 });
    expect(p.BTC).toBeNull();
  });
  it("the price badge distinguishes sources in text, not colour alone", () => {
    const src = read("components/investor/PriceBadge.tsx");
    expect(src).toContain("investor.live");
    expect(src).toContain("investor.manual");
  });
});

describe("privacy and no-trading guarantees", () => {
  const files = [...walk("components/investor"), ...walk("app/investor"), ...walk("lib/investor")];
  it("investor UI never touches browser storage or the journal, and never places orders", () => {
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/localStorage|sessionStorage|indexedDB/);
      expect(src, f).not.toMatch(/lib\/journal|components\/journal/);
      expect(src, f).not.toMatch(/\/order|apiKey|secret/i);
    }
  });
  it("only public Binance market data is used", () => {
    const used = files.filter((f) => /binance/i.test(read(f)) && /from ["']@\/lib\/binance["']/.test(read(f)));
    for (const f of used) expect(read(f)).toMatch(/getKlines|getKlinesFrom/);
  });
});

describe("simplified Investor wording and flows", () => {
  const trade = read("components/investor/TradeForm.tsx");
  it("every holding has a visible Sell button wired to the sell form", () => {
    expect(read("components/investor/Dashboard.tsx")).toMatch(/onSell\(h\.asset/);
    expect(read("components/investor/Dashboard.tsx")).toContain('t("investor.sellBtn")');
    expect(read("app/investor/page.tsx")).toContain('kind: "sell"');
  });
  it("sell form has 25/50/75/100% quick buttons and a live realized-PnL preview", () => {
    expect(trade).toContain("[25, 50, 75, 100]");
    expect(trade).toContain("previewSale");
    expect(trade).toContain("investor.realizedSale");
  });
  it("fees are automatic by default: manual entry is off unless the user opts in", () => {
    expect(trade).toContain("calcFee(");
    expect(trade).toContain("investor.bnbSwitch");
    expect(trade).toMatch(/\{manual && \(/);
  });
  it("DCA explains purchases and reference price with the worked examples, in all languages", () => {
    expect(investorEn.hCount).toMatch(/how many times you plan to buy/i);
    expect(investorEn.hCount).toContain("$50 weekly × 8 purchases = $400");
    expect(investorEn.hRef).toMatch(/starting price used to calculate dip-buy levels/i);
    expect(investorEn.hRef).toContain("$100,000");
    expect(investorEn.hRef).toContain("$90,000");
    for (const d of [investorFr, investorAr]) { expect(d.hCount).toMatch(/50/); expect(d.hCount).toMatch(/400/); expect(d.hRef).toMatch(/100[ ,]000/); expect(d.hRef).toMatch(/90[ ,]000/); }
  });
  it("the tab is no longer called 'Journal' (it is not the Trading Journal)", () => {
    expect(investorEn.tabLedger).toBe("My records");
    expect(investorEn.noHoldings).not.toMatch(/Journal tab/);
  });
  it("every translation key the UI uses exists", () => {
    const src = [...walk("components/investor"), ...walk("app/investor")].map(read).join("\n");
    for (const k of new Set([...src.matchAll(/investor\.(\w+)(?![\w$])/g)].map((m) => m[1]))) expect(investorEn, k).toHaveProperty(k);
  });
});

describe("one clear Sell action, calmer price badge", () => {
  it("the records tab has no second 'Add sale' button; Sell lives on each holding", () => {
    expect(read("components/investor/Ledger.tsx")).not.toContain('open(blank("sell"))');
    expect(read("components/investor/Dashboard.tsx")).toContain("onSell(");
    // pinned to the table edge so the button is visible without sideways scrolling
    expect(read("components/investor/Dashboard.tsx")).toMatch(/sticky end-0[^"]*"[^>]*>\s*<button[^>]*onClick=\{\(\) => onSell/);
    expect(investorEn.salesHint).toMatch(/Sell/);
  });
  it("price badge: short 'Live' pill with Binance as tooltip; manual stays distinct", () => {
    const src = read("components/investor/PriceBadge.tsx");
    expect(src).toContain("investor.liveShort");
    expect(src).toMatch(/title=\{tip\}/);
    expect(src).toContain("border-dashed");
    expect(investorEn.liveShort).toBe("Live");
    expect(investorEn.live).toMatch(/Binance/);
  });
});

describe("homepage feature section and sign-in return", () => {
  it("the homepage links to /investor with an 'Explore Investor' CTA and keeps its other sections", () => {
    const home = read("app/page.tsx");
    expect(home).toContain("InvestorSection");
    for (const kept of ["MarketStrip", "ProductShowcase", "IntelSection", "ToolsSection", "CommunitySection"]) expect(home).toContain(kept);
    expect(read("components/home/InvestorSection.tsx")).toContain('href="/investor"');
    expect(investorEn.homeCta).toBe("Explore Investor");
  });
  it("describes the five things asked for, in every language", () => {
    for (const d of [investorEn, investorFr, investorAr]) {
      for (const k of ["homeBody", "homeF1Title", "homeF2Title", "homeF3Title", "homeF4Title", "homeCta", "homeNote"] as const) expect(d[k].length).toBeGreaterThan(5);
    }
    expect(investorEn.homeBody).toMatch(/months or years/);
    expect(investorEn.homeF1Title).toMatch(/Portfolio tracking/);
    expect(investorEn.homeF2Title).toMatch(/Manual purchase records/);
    expect(investorEn.homeF3Title).toMatch(/DCA/);
    expect(investorEn.homeF4Title).toMatch(/Performance/);
  });
  it("the illustration shows no money amounts", () => {
    expect(read("components/home/InvestorSection.tsx")).not.toMatch(/\$\s?\d/);
  });
});
