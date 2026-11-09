import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dictionaries } from "@/lib/i18n";
import { INVESTOR_ASSETS } from "@/lib/investor/assets";
import { investorEligible, smartActions, smartBase } from "@/lib/smartActions";

const SEVENTEEN = ["BTC", "ETH", "SOL", "XRP", "HYPE", "DOGE", "LINK", "AVAX", "HBAR", "LTC", "BNB", "DOT", "SUI", "NEAR", "TRX", "ZEC", "ADA"];
const src = (f: string) => readFileSync(f, "utf8");

describe("Investor eligibility (only the 17 supported coins)", () => {
  it("matches the Investor asset list exactly", () => {
    expect(INVESTOR_ASSETS.map((a) => a.ticker)).toEqual(SEVENTEEN);
  });
  it("is true for each of the 17, however the coin is written", () => {
    for (const c of SEVENTEEN) {
      expect(investorEligible(c)).toBe(true);
      expect(investorEligible(`${c}USDT`)).toBe(true);
      expect(investorEligible(`${c.toLowerCase()}/usdt`)).toBe(true);
    }
  });
  it("is false for every other coin and for junk input", () => {
    for (const c of ["PEPE", "SHIB", "BCH", "UNI", "MATIC", "ATOM", "APT", "BTCB", "1INCH"]) expect(investorEligible(c)).toBe(false);
    for (const c of ["", " ", "BTC/ETH", "BTC/USD", "a/b/c"]) expect(investorEligible(c)).toBe(false);
  });
});

describe("links", () => {
  it("offers all four actions for a supported coin, with the coin prefilled", () => {
    expect(smartActions("BTC")).toEqual([
      { key: "analyze", href: "/analyzer?pair=BTC%2FUSDT" },
      { key: "plan", href: "/trade-plan?pair=BTC%2FUSDT" },
      { key: "bought", href: "/journal?pair=BTC%2FUSDT" },
      { key: "invest", href: "/investor?asset=BTC" },
    ]);
  });
  it("never offers Investor for other coins", () => {
    for (const c of ["PEPE", "SHIB", "UNI", "1INCH"]) {
      const keys = smartActions(c).map((a) => a.key);
      expect(keys).toEqual(["analyze", "plan", "bought"]);
    }
  });
  it("returns nothing for something that is not a USDT coin", () => {
    expect(smartActions("")).toEqual([]);
    expect(smartActions("BTC/ETH")).toEqual([]);
    expect(smartBase("ethusdt")).toBe("ETH");
  });
  it("the Analyzer link uses the query the Analyzer already reads", () => {
    expect(src("app/analyzer/page.tsx")).toContain('searchParams.get("pair")');
    expect(decodeURIComponent(smartActions("SOL")[0].href.split("=")[1])).toBe("SOL/USDT");
  });
});

describe("strings in EN, FR and AR", () => {
  const keys = ["title", "onWatchlist", "offWatchlist", "analyze", "analyzeHint", "plan", "planHint", "bought", "boughtHint", "invest", "investHint", "note", "afterAnalysis"];
  it("has every Smart Actions string, with the {coin} placeholder where needed", () => {
    for (const l of ["en", "fr", "ar"] as const) {
      const s = (dictionaries[l].chart as unknown as { smart: Record<string, string> }).smart;
      for (const k of keys) expect(s[k]?.length).toBeGreaterThan(0);
      for (const k of ["title", "analyzeHint", "planHint"]) expect(s[k]).toContain("{coin}");
    }
  });
  it("has the Trade Plan 'plan kept' message in all three languages", () => {
    for (const l of ["en", "fr", "ar"] as const) {
      const m = (dictionaries[l] as unknown as { tradePlan: Record<string, string> }).tradePlan.pairKept;
      expect(m).toContain("{coin}");
    }
  });
});

describe("wiring and safety", () => {
  const comp = src("components/SmartActions.tsx");
  it("sits in the shared chart panel (Radar and Market Intelligence), with analysis context", () => {
    expect(src("components/charts/AnalysisPanel.tsx")).toContain("<SmartActions base={baseAsset} analyzed={!!analysis} />");
    for (const f of ["app/radar/page.tsx", "app/market-intelligence/page.tsx"]) expect(src(f)).toContain("<AnalysisPanel");
  });
  it("reuses the Watchlist star and store; no new API, storage, fetch or records", () => {
    expect(comp).toContain("StarButton");
    expect(comp).toContain("useWatchlist");
    expect(comp).not.toMatch(/fetch\(|localStorage|sessionStorage|\/api\/|method:\s*["']POST/);
    expect(src("lib/smartActions.ts")).not.toMatch(/fetch\(|localStorage|\/api\//);
  });
  it("never assumes a purchase: the Journal action is a question and the note says nothing is saved", () => {
    expect((dictionaries.en.chart as unknown as { smart: Record<string, string> }).smart.bought).toBe("Already bought?");
    expect(comp).toContain("chart.smart.note");
  });
  it("the Trade Plan never overwrites work in progress", () => {
    const tp = src("app/trade-plan/page.tsx");
    expect(tp).toContain('params.get("pair")');
    expect(tp).toContain("if (hasWork || cur.signal) setSignalMsg(t(\"tradePlan.pairKept\")");
  });
  it("the Journal only opens the empty form (no save) and Investor only accepts its 17 coins", () => {
    const j = src("app/journal/page.tsx");
    const block = j.slice(j.indexOf("/journal?pair=BTC"), j.indexOf("if (id) {"));
    expect(block).toContain("setEditing(");
    expect(block).not.toMatch(/persist|saveTrades|setTrades/);
    const inv = src("app/investor/page.tsx");
    expect(inv).toContain("isSupportedTicker(a)");
    expect(inv).toContain("setDraft({ asset: a })");
  });
  it("leaves the Analyzer untouched", () => {
    expect(src("app/analyzer/page.tsx")).not.toMatch(/SmartActions|smartActions/);
  });
});
