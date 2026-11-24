// ATLAS CHARTS — Phase 1: structure checks (source-level; no browser in the unit suite).
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { i18nSource } from "./helpers/i18nSource";

const nav = readFileSync("components/Nav.tsx", "utf8");
const ws = readFileSync("components/charts/ChartWorkspace.tsx", "utf8");
const page = readFileSync("app/charts/page.tsx", "utf8");
const i18n = i18nSource();

describe("ATLAS CHARTS page", () => {
  it("is a public page that renders the workspace and sets metadata", () => {
    expect(page).toContain("<ChartWorkspace />");
    expect(page).toContain("export const metadata");
  });
  it("adds Charts to Markets (desktop dropdown and mobile group share one list) and keeps the existing items", () => {
    const m = nav.match(/const MARKETS = \[([\s\S]*?)\];/);
    expect([...m![1].matchAll(/href: "([^"]+)"/g)].map((x) => x[1])).toEqual(["/radar", "/market-intelligence", "/watchlist", "/charts"]);
    expect(m![1]).toContain('t("nav.charts")');
    expect(i18n.match(/    charts: "/g)?.length).toBe(3);
  });
  it("uses the existing chart stack and the isolated kline stream, not the shared ticker stream or a new engine", () => {
    expect(ws).toContain('import("lightweight-charts")');
    expect(ws).toContain("/api/chart/klines");
    expect(ws).toContain("createKlineStream");
    expect(ws).not.toContain("@/lib/binanceStream");
    expect(ws).toContain("calcEMA");
    expect(ws).toContain(".update(");
    expect(ws).not.toContain("tradingview.com/widget");
  });
  it("keeps the Apache-2.0 attribution visible and a NOTICE file in the repository", () => {
    expect(ws).toContain("TradingView Lightweight Charts™");
    expect(ws).toContain('href="https://www.tradingview.com/"');
    expect(ws).not.toContain("attributionLogo: false");
    expect(existsSync("NOTICE")).toBe(true);
    expect(readFileSync("NOTICE", "utf8")).toContain("https://www.tradingview.com/");
  });
  it("has every charts.* string in English, Arabic and French", () => {
    const keys = ["eyebrow", "title", "subtitle", "symbolLabel", "quickPairs", "noMatch", "timeframeLabel", "indicatorsLabel", "loading", "retry", "live", "connecting", "reconnecting", "stale", "disclaimer"];
    const errKeys = ["unsupportedPair", "unsupportedInterval", "network", "unavailable", "noData"];
    for (const l of ["en", "ar", "fr"]) {
      const src = readFileSync(`lib/i18n/${l}.ts`, "utf8");
      const start = src.indexOf("\n  charts: {\n");
      expect(start, l).toBeGreaterThan(-1);
      const block = src.slice(start, src.indexOf("\n  },\n", start));
      for (const k of keys) expect(block, `${l}.${k}`).toMatch(new RegExp(`\\n    ${k}: "[^"]+",`));
      for (const k of errKeys) expect(block, `${l}.err.${k}`).toMatch(new RegExp(`\\n      ${k}: "[^"]+",`));
    }
    for (const k of [...keys.map((x) => `charts.${x}`), ...errKeys.map((x) => `charts.err.${x}`), "nav.charts"]) expect(ws + readFileSync("components/charts/ChartSymbolPicker.tsx", "utf8") + nav).toContain(k.startsWith("charts.err.") ? "charts.err." : k.replace(/^charts\./, "charts."));
  });
  it("does not add persistence, drawings or membership gating in Phase 1", () => {
    expect(ws).not.toMatch(/localStorage|redis|@clerk|useAuth|chartDrawings|drawingsPrimitive/i);
  });
});
