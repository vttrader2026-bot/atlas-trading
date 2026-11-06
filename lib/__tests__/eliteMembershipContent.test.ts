// ELITE-CONTENT-v1: one wording for the ATLAS ELITE plan, in EN / FR / AR, everywhere it is shown.
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { dictionaries } from "@/lib/i18n";
import { eliteNowPayload } from "@/lib/push";
import { analyzeLimitForPlan } from "@/lib/plan";
import { WATCHLIST_LIMITS } from "@/lib/watchlistConfig";

type Dict = Record<string, string>;
const sec = (l: "en" | "ar" | "fr") => dictionaries[l].eliteSection as unknown as Dict;
const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const KEYS = ["eyebrow", "heading", "subtitle", "g1", "g2", "g3", "g4", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "perMonth", "cta"];

describe("ATLAS ELITE plan content", () => {
  it("English is exactly the approved text", () => {
    const e = sec("en");
    expect(e.eyebrow).toBe("ATLAS ELITE");
    expect(e.heading).toBe("Trade with Atlas. Stay ahead of every opportunity.");
    expect(e.subtitle).toBe("Unlock exclusive spot signals, advanced analysis tools and complete trade management — all in one membership.");
    expect([e.g1, e.g2, e.g3, e.g4]).toEqual(["Exclusive Trading Access", "Complete Trade Management", "Advanced Trading Tools", "Private Community"]);
    expect([e.f1, e.f2]).toEqual(["Private Spot Signals", "Exclusive Elite Market Updates"]);
    expect([e.f3, e.f4, e.f5]).toEqual(["TP1, TP2 and TP3 Updates", "Stop-Loss Updates", "Full Trade Management"]);
    expect([e.f6, e.f7]).toEqual(["AI Analyzer — Up to 20 analyses per day", "Personal Watchlist — Save up to 50 coins"]);
    expect([e.f8, e.f9]).toEqual(["Private Telegram Group", "Exclusive Atlas Bot Alerts"]);
  });
  it("French and Arabic have every key, non-empty, translated (not copies of English)", () => {
    for (const l of ["fr", "ar"] as const) {
      expect(Object.keys(sec(l)).sort()).toEqual([...KEYS].sort());
      for (const k of KEYS) {
        expect(sec(l)[k].trim().length, `${l}.${k}`).toBeGreaterThan(0);
        if (!["eyebrow", "cta"].includes(k)) expect(sec(l)[k], `${l}.${k}`).not.toBe(sec("en")[k]);
      }
    }
    expect(Object.keys(sec("en")).sort()).toEqual([...KEYS].sort());
  });
  it("Arabic is Arabic script; French is Latin with accents where expected", () => {
    for (const k of ["heading", "subtitle", "g1", "g2", "g3", "g4", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9"]) expect(sec("ar")[k]).toMatch(/[؀-ۿ]/);
    for (const k of ["heading", "subtitle", "g1", "f1", "f6"]) expect(sec("fr")[k]).not.toMatch(/[؀-ۿ]/);
  });
  it("the advertised limits are the real limits (20 analyses a day, 50 watchlist coins)", () => {
    expect(analyzeLimitForPlan("elite")).toBe(20);
    expect(WATCHLIST_LIMITS.elite).toBe(50);
    for (const l of ["en", "ar", "fr"] as const) {
      expect(sec(l).f6).toMatch(/20/);
      expect(sec(l).f7).toMatch(/50/);
    }
  });
  it("never advertises earlier signal access, in any language, anywhere in the plan text", () => {
    const early = /earlier|early access|ahead of the public|before (everyone|the public|free)|plus tôt|en avance|avant (les autres|tout le monde|le public)|مبكر|قبل الجميع|أسبق|وصول أسبق/i;
    for (const l of ["en", "ar", "fr"] as const) {
      for (const k of KEYS) expect(sec(l)[k], `${l}.${k}`).not.toMatch(early);
      const home = dictionaries[l].home as unknown as { faq: Dict };
      expect(home.faq.a4).not.toMatch(early);
      expect(String((dictionaries[l].footer as unknown as Dict).eliteTagline)).not.toMatch(early);
    }
    for (const f of ["app/elite/page.tsx", "app/page.tsx", "components/Footer.tsx", "lib/push.ts"]) expect(src(f), f).not.toMatch(/early access|earlier access/i);
  });
});

describe("the same content is shown everywhere the plan is presented", () => {
  it("the home membership card and the /elite page render every group and benefit from the shared text", () => {
    for (const f of ["app/page.tsx", "app/elite/page.tsx"]) {
      const s = src(f);
      for (const k of ["eyebrow", "heading", "subtitle", "g1", "g2", "g3", "g4", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9"].filter((k) => !(f.includes("elite/") && k === "eyebrow"))) {
        expect(s, `${f} ${k}`).toContain(`eliteSection.${k}`);
      }
      expect(s).toContain("eliteSection.perMonth");
    }
  });
  it("the footer, FAQ and promo notification use the same description", () => {
    for (const l of ["en", "ar", "fr"] as const) expect((dictionaries[l].footer as unknown as Dict).eliteTagline).toBe(sec(l).subtitle);
    expect(eliteNowPayload("en").body).toBe(sec("en").subtitle);
    expect(eliteNowPayload("ar").body).toBe(sec("ar").subtitle);
    expect(eliteNowPayload("en").url).toBe("/elite");
  });
  it("the FAQ answer lists the same nine benefits (EN)", () => {
    const a = (dictionaries.en.home as unknown as { faq: Dict }).faq.a4;
    for (const w of ["private spot signals", "exclusive Elite market updates", "TP1 / TP2 / TP3", "stop-loss updates", "full trade management", "20 AI analyses", "50 coins", "private Telegram group", "exclusive Atlas Bot alerts"]) expect(a).toContain(w);
  });
  it("price, payment flow and button targets are unchanged", () => {
    const elite = src("app/elite/page.tsx");
    expect(elite).toContain('{ usd: "14.99", mru: "600" }');
    expect(elite).toContain('plan: "elite"');
    expect(elite).toContain("/api/payments");
    expect(src("app/page.tsx")).toContain('href="/elite"');
    expect(src("app/page.tsx")).toContain("$14.99");
    expect(src("components/Footer.tsx")).toContain("$14.99");
    expect(src("components/Footer.tsx")).toContain('href="/elite"');
  });
  it("RTL: the language provider switches the document to rtl for Arabic only", () => {
    const i = src("lib/i18n.tsx");
    expect(i).toContain('document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"');
  });
});
