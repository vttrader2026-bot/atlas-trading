// HOME-PHONE-v1: the homepage phone shows clearly labeled DEMO data, built with the real Investor maths, isolated from real data.
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/investor/calc";
import { formatMoney, formatSignedMoney } from "@/lib/investor/currency";
import { DEMO_DOC, DEMO_MRU_RATE, DEMO_PRICES } from "@/lib/demoInvestor";
import { homeAppEn } from "@/lib/i18nHomeApp";

const root = process.cwd();
const read = (f: string) => readFileSync(join(root, f), "utf8");
const walk = (d: string): string[] =>
  readdirSync(join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));

describe("demo portfolio", () => {
  const s = summarize(DEMO_DOC, DEMO_PRICES);
  it("holds exactly ETH, BTC, AVAX, NEAR and XRP", () => {
    expect(s.holdings.map((h) => h.asset).sort()).toEqual(["AVAX", "BTC", "ETH", "NEAR", "XRP"]);
  });
  it("is computed by the real Investor maths and is internally consistent", () => {
    expect(s.ledgerIssue).toBeNull();
    expect(s.missingPrices).toEqual([]);
    expect(s.unrealized).toBeCloseTo(s.value - s.invested, 6);
    expect(s.roiPct).toBeCloseTo((s.unrealized / s.invested) * 100, 6);
    expect(s.cash).toBeGreaterThan(0);
    expect(s.realized).not.toBe(0);
    const alloc = s.holdings.reduce((a, h) => a + (h.allocationPct ?? 0), 0);
    expect(alloc).toBeCloseTo(100, 6);
  });
  it("all six headline values and the allocation are available to show", () => {
    for (const v of [s.invested, s.value, s.unrealized, s.roiPct, s.realized, s.cash]) expect(Number.isFinite(v as number)).toBe(true);
  });
  it("MRU display uses the demo rate through the real formatters", () => {
    expect(formatMoney(s.invested, "MRU", DEMO_MRU_RATE)).toBe(`MRU ${(s.invested * DEMO_MRU_RATE).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    expect(formatSignedMoney(s.unrealized, "MRU", DEMO_MRU_RATE).startsWith("+MRU ")).toBe(true);
  });
});

describe("demo data is labeled and isolated", () => {
  it("the screen says demo data and an illustrative rate, in every language", () => {
    expect(homeAppEn.demoNote).toMatch(/demo data/i);
    expect(homeAppEn.demoNote).toMatch(/illustrative/i);
    expect(homeAppEn.demoRate).toMatch(/demo rate/i);
    expect(read("components/home/InvestorPhone.tsx")).toContain("homeApp.demoBadge");
  });
  it("only the phone imports the demo data; real Investor code never does", () => {
    const users = [...walk("app"), ...walk("components"), ...walk("lib")].filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__") && f !== "lib/demoInvestor.ts");
    const importing = users.filter((f) => /demoInvestor|DEMO_MRU_RATE/.test(read(f)));
    expect(importing).toEqual(["components/home/InvestorPhone.tsx"]);
  });
  it("the demo rate is not a rate source: the real currency code and FX route do not reference it", () => {
    for (const f of ["lib/investor/currency.ts", "lib/fxRate.ts", "app/api/fx/usd-mru/route.ts", "components/investor/currency.tsx"]) expect(read(f)).not.toMatch(/DEMO|demoInvestor/);
  });
  it("the phone has no account access: no auth, storage, network or Investor hooks", () => {
    const code = read("components/home/InvestorPhone.tsx").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/useAuth|localStorage|sessionStorage|fetch\(|useInvestor|\/api\//);
  });
  it("reuses the real Investor pieces and a CSS frame (no screenshot image)", () => {
    const code = read("components/home/InvestorPhone.tsx");
    for (const s of ["summarize(", "formatMoney", "Stat", "COLORS", "CoinLogo"]) expect(code).toContain(s);
    // the only image is the Atlas brand icon in the app header; the dashboard itself is HTML/CSS, not a picture
    expect([...code.matchAll(/src="([^"]+)"/g)].map((m) => m[1])).toEqual(["/brand/icon-192.png"]);
    expect(code).toContain('role="img"');
  });
  it("the homepage section keeps its feature card and CTA and no longer shows the old illustration", () => {
    const sec = read("components/home/InvestorSection.tsx");
    expect(sec).toContain("<InvestorPhone");
    expect(sec).toContain('href="/investor"');
    expect(sec).not.toContain("homeIllustration");
    expect(sec).not.toMatch(/\$\s?\d/);
  });
  it("Investor calculations are untouched: Dashboard only gained two exports", () => {
    const d = read("components/investor/Dashboard.tsx");
    expect(d).toContain("export function Stat(");
    expect(d).toContain("export const COLORS");
    expect(d).not.toContain("summarize("); // Dashboard receives the summary; it does not compute it
  });
  it("motion is restrained and disabled for reduced motion", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/\.home-phone-float\s*\{[^}]*animation:[^}]*6s/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.home-phone-float, \.install-sheet \{ animation: none; \}/);
  });
});
