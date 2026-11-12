// HERO-PHONE-v1: the homepage hero smartphone. Same phone as the Investor showcase, separate component, DEMO data only.
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { dictionaries } from "@/lib/i18n";
import { DEMO_ANALYZER, DEMO_INTEL, DEMO_MARKET, DEMO_PORTFOLIO, DEMO_RADAR, DEMO_SIGNAL, fmtPct, fmtUsd } from "@/lib/demoHero";
import { DEMO_MRU_RATE } from "@/lib/demoInvestor";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const hero = read("components/home/HeroPhone.tsx");
const investor = read("components/home/InvestorPhone.tsx");
const walk = (d: string): string[] => readdirSync(join(process.cwd(), d)).flatMap((n) => {
  const p = `${d}/${n}`;
  return statSync(join(process.cwd(), p)).isDirectory() ? walk(p) : [p];
});

describe("same virtual iPhone as the Investor section", () => {
  it("uses the exact frame, proportions, styling and float animation", () => {
    for (const cls of [
      "rounded-[2.7rem] border border-white/10 bg-[#14181f] p-[7px]",
      "shadow-[0_28px_60px_-18px_rgba(0,0,0,0.65),0_0_0_1px_rgba(245,185,66,0.12)]",
      "rounded-[2.1rem] bg-bg", "home-phone-float", "-start-[3px] top-24 h-10 w-[3px]", "-end-[3px] top-32 h-16 w-[3px]",
      "h-[26px] w-[96px]", "h-1 w-28",
    ]) {
      expect(investor, `investor ${cls}`).toContain(cls);
      expect(hero, `hero ${cls}`).toContain(cls);
    }
    for (const c of ["const SCREEN_W = 390;", "const SCREEN_H = 844;"]) expect(hero).toContain(c);
  });
  it("is a separate component: the Investor phone and section are not changed by it", () => {
    expect(investor).not.toMatch(/HeroPhone|demoHero/);
    const sec = read("components/home/InvestorSection.tsx");
    expect(sec).toContain("<InvestorPhone");
    expect(sec).not.toMatch(/HeroPhone|demoHero/);
  });
  it("demoInvestor.ts stays private to the Investor phone", () => {
    expect(hero).not.toMatch(/demoInvestor|DEMO_MRU_RATE|summarize\(/);
  });
});

describe("hero placement", () => {
  const page = read("app/page.tsx");
  it("the hero shows the phone beside the headline and CTAs, after them in the source (mobile: text first)", () => {
    expect(page).toContain("<HeroPhone />");
    expect(page).not.toContain("<HeroBoard");
    const h1 = page.indexOf("<h1"), cta = page.indexOf("homeV2.hero.exploreCta"), phone = page.indexOf("<HeroPhone />");
    expect(h1).toBeGreaterThan(0);
    expect(cta).toBeGreaterThan(h1);
    expect(phone).toBeGreaterThan(cta);
    expect(page).toContain("lg:grid-cols-[1.05fr_0.95fr]");
  });
  it("existing homepage content, links and sections are kept", () => {
    for (const s of ['href="/radar"', 'href="/sign-up"', 'href="/analyzer"', "<MarketStrip", "<ProductShowcase", "<InvestorSection", "<CommunitySection", 'href="/elite"']) expect(page, s).toContain(s);
  });
  it("HeroBoard.tsx is kept: ProductShowcase still imports topOutperformers from it", () => {
    expect(existsSync(join(process.cwd(), "components/home/HeroBoard.tsx"))).toBe(true);
    expect(read("components/home/ProductShowcase.tsx")).toContain("topOutperformers");
  });
  it("on desktop the phone is sized from the viewport height so it fits the first screen", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/\.hero-phone-w\s*\{[^}]*max-width:\s*300px/);
    expect(css).toMatch(/min-width:\s*1024px\)\s*\{\s*\.hero-phone-w\s*\{[^}]*100svh/);
    expect(hero).toContain("hero-phone-w");
  });
  it("only the hero imports the hero demo data", () => {
    const users = [...walk("app"), ...walk("components"), ...walk("lib")].filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__") && f !== "lib/demoHero.ts");
    expect(users.filter((f) => /demoHero/.test(read(f)))).toEqual(["components/home/HeroPhone.tsx"]);
  });
});

describe("the screen features the whole ecosystem, labeled as demo", () => {
  it("has BTC/ETH, Market Intelligence, Radar, Trade Feed, Analyzer and Investor", () => {
    for (const s of ["DEMO_MARKET.btc", "DEMO_MARKET.eth", "nav.marketIntel", "nav.radar", "nav.tradeFeed", "nav.analyzer", "nav.investor", "DEMO_PORTFOLIO"]) expect(hero, s).toContain(s);
  });
  it("is labeled DEMO on the phone and in the caption, in all three languages", () => {
    expect(hero).toContain("homeApp.demoBadge");
    expect(hero).toContain("homeApp.heroNote");
    for (const l of ["en", "fr", "ar"] as const) {
      const d = (dictionaries[l] as unknown as { homeApp: Record<string, string> }).homeApp;
      for (const k of ["demoBadge", "heroAria", "heroNote", "heroFearGreed", "heroGreed", "heroDominance", "heroBeatBtc", "heroSpotLong", "heroActive", "heroEntry", "heroStop", "heroValid", "heroChStructure", "heroChVolume", "heroChRoom", "heroChHtf"]) expect(d[k], `${l} ${k}`).toBeTruthy();
    }
    const en = (dictionaries.en as unknown as { homeApp: Record<string, string> }).homeApp;
    expect(en.heroNote).toMatch(/demo/i);
    expect(en.heroNote).toMatch(/not live prices/i);
    expect(en.heroNote).toMatch(/not financial advice/i);
  });
  it("shows no account data and makes no network, storage or auth calls", () => {
    const code = hero.replace(/\/\/.*$/gm, "") + read("lib/demoHero.ts").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/fetch\(|localStorage|sessionStorage|useAuth|useUser|useInvestor|\/api\//);
    expect([...hero.matchAll(/src="([^"]+)"/g)].map((m) => m[1])).toEqual(["/brand/icon-192.png"]);
    expect(hero).toContain('role="img"');
    expect(hero).toContain("aria-hidden");
  });
  it("the Analyzer preview names no RSI or ATR gate (they no longer decide a verdict)", () => {
    expect(hero + read("lib/demoHero.ts")).not.toMatch(/\bRSI\b|\bATR\b/);
    expect([...DEMO_ANALYZER.checks]).toEqual(["structure", "volume", "htf", "room"]);
  });
});

describe("demo data is realistic and consistent", () => {
  it("the signal is a valid spot LONG: stop < entry zone < TP1 < TP2 < TP3", () => {
    const s = DEMO_SIGNAL;
    expect(s.pair.endsWith("/USDT")).toBe(true);
    expect(s.stop).toBeLessThan(s.entryLow);
    expect(s.entryLow).toBeLessThan(s.entryHigh);
    expect(s.entryHigh).toBeLessThan(s.tp1);
    expect(s.tp1).toBeLessThan(s.tp2);
    expect(s.tp2).toBeLessThan(s.tp3);
  });
  it("Radar rows are the coins beating BTC, strongest first, three of them", () => {
    expect(DEMO_RADAR).toHaveLength(3);
    const v = DEMO_RADAR.map((r) => r.vsBtcPct);
    expect(v.every((x) => x > 0)).toBe(true);
    expect([...v].sort((a, b) => b - a)).toEqual(v);
  });
  it("market and sentiment values are in range, and the series are drawable", () => {
    for (const c of [DEMO_MARKET.btc, DEMO_MARKET.eth]) {
      expect(c.price).toBeGreaterThan(0);
      expect(c.series.length).toBeGreaterThan(5);
      expect(Math.sign(c.series[c.series.length - 1] - c.series[0])).toBe(Math.sign(c.changePct));
    }
    expect(DEMO_INTEL.fearGreed).toBeGreaterThanOrEqual(0);
    expect(DEMO_INTEL.fearGreed).toBeLessThanOrEqual(100);
    expect(DEMO_INTEL.btcDominancePct).toBeGreaterThan(0);
  });
  it("the portfolio matches the Investor phone's demo: 433,840 MRU at the 40 demo rate = 10,846 USDT", () => {
    expect(DEMO_PORTFOLIO.valueUsdt * DEMO_MRU_RATE).toBe(433840);
    expect(DEMO_PORTFOLIO.roiPct).toBe(6.75);
  });
  it("formatters", () => {
    expect(fmtUsd(71250)).toBe("$71,250");
    expect(fmtUsd(10846)).toBe("$10,846");
    expect(fmtPct(1.8)).toBe("+1.80%");
    expect(fmtPct(-2)).toBe("-2.00%");
  });
});
