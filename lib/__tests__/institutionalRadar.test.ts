// INSTITUTIONAL-RADAR-v1: the feature is named "Institutional Radar" (never translated) everywhere; the route and the
// functionality are unchanged. The homepage live-market section that is also called "Market Pulse" is a different thing.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dictionaries } from "@/lib/i18n";
import { miT } from "@/lib/marketIntelI18n";

const read = (f: string) => readFileSync(f, "utf8");
const NAME = "Institutional Radar";
const DESC = {
  en: "Institutional Radar is a curated crypto research tool that helps users discover and compare digital assets connected to major institutional portfolios, indices and public market narratives. It is designed for research and discovery, not as a guarantee of investment performance.",
  ar: "Institutional Radar هي أداة بحث متخصصة في سوق العملات الرقمية، تساعد المستخدمين على اكتشاف ومقارنة الأصول الرقمية المرتبطة بالمحافظ المؤسسية الكبرى والمؤشرات والسرديات المتداولة في الأسواق.",
  fr: "Institutional Radar est un outil de recherche dédié aux cryptomonnaies qui permet de découvrir et de comparer des actifs numériques liés aux grands portefeuilles institutionnels, aux indices et aux tendances narratives du marché.",
} as const;
const langs = ["en", "ar", "fr"] as const;
type D = Record<string, unknown>;
const get = (l: (typeof langs)[number], path: string) => path.split(".").reduce<unknown>((o, k) => (o as D)[k], dictionaries[l]) as string;

describe("official name, identical in English, Arabic and French", () => {
  it("navigation, home section heading and page title use the exact name", () => {
    for (const l of langs) {
      expect(get(l, "nav.marketIntel"), l).toBe(NAME);
      expect(get(l, "intelSection.heading"), l).toBe(NAME);
      expect(miT(l, "title"), l).toBe(NAME);
      expect(get(l, "intelSection.cta"), l).toContain(NAME);
      expect(miT(l, "authGate.body"), l).toContain(NAME);
    }
  });
  it("the official description is used on the home section and the page, exactly, in each language", () => {
    for (const l of langs) {
      expect(get(l, "intelSection.body"), l).toBe(DESC[l]);
      expect(miT(l, "subtitle"), l).toBe(DESC[l]);
    }
  });
  it("feature mentions in plans, FAQs, the Discover step and the WhatsApp bot use the new name", () => {
    for (const l of langs) {
      expect(get(l, "workflow.steps.discover.desc"), l).toContain(NAME);
    }
    const i18n = read("lib/i18n.tsx");
    expect(i18n.match(/Institutional Radar/g)?.length).toBeGreaterThanOrEqual(24); // nav x3, home section x6, plans, FAQs, Discover step
    const bot = read("lib/whatsappBot.ts");
    expect(bot.match(/Institutional Radar/g)?.length).toBe(3);
    expect(bot).not.toMatch(/Market Pulse|وMarket/);
  });
  it("no old feature name is left in the three dictionaries or the page's own translations (except the unrelated live-market section)", () => {
    const i18n = read("lib/i18n.tsx");
    const left = (i18n.match(/.*(Market Pulse|MARKET PULSE|نبض السوق|Market Intelligence).*/g) ?? []).filter((l) => !/all-in-one crypto trading ecosystem|عنوان|منظومة/.test(l));
    expect(left.map((l) => l.trim())).toEqual(['eyebrow: "MARKET PULSE",', 'eyebrow: "نبض السوق",']); // pulseSection = the homepage Live Markets snapshot
    expect(read("lib/marketIntelI18n.ts")).not.toMatch(/Market Pulse|MARKET PULSE|نبض السوق|ماركت إنتليجنس/);
  });
});

describe("route and functionality unchanged", () => {
  it("the page still lives at /market-intelligence and every link to it is intact", () => {
    expect(existsSync("app/market-intelligence/page.tsx")).toBe(true);
    for (const f of ["components/Nav.tsx", "components/home/IntelSection.tsx", "components/home/ProductShowcase.tsx", "app/workflow/page.tsx", "lib/quickNav.ts"]) expect(read(f), f).toContain("/market-intelligence");
    expect(read("lib/quickNav.ts")).toContain('labelKey: "nav.marketIntel"');
  });
  it("the page's data sources, groups and logic files were not touched", () => {
    const page = read("app/market-intelligence/page.tsx");
    for (const k of ["CATEGORY_META", "GROUP_STYLE", "AnalysisPanel", "useAuth"]) expect(page).toContain(k);
    for (const f of ["lib/marketIntelAssets.ts", "lib/marketIntelCompute.ts", "lib/marketIntelSnapshots.ts"]) expect(existsSync(f), f).toBe(true);
  });
});

describe("SEO and social metadata for the page", () => {
  it("title, description, canonical, Open Graph and Twitter use the new name and description", () => {
    const s = read("app/market-intelligence/layout.tsx");
    expect(s).toContain('const TITLE = "Institutional Radar | Atlas Trading"');
    expect(s).toContain(DESC.en);
    for (const k of ["alternates: { canonical: \"/market-intelligence\" }", "openGraph:", "twitter:", "title: TITLE", "description: DESCRIPTION"]) expect(s).toContain(k);
    expect(s).not.toMatch(/Market Pulse|Market Intelligence/);
  });
});
