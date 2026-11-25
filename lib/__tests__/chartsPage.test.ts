// ATLAS CHARTS — Phase 1: structure checks (source-level; no browser in the unit suite).
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { i18nSource } from "./helpers/i18nSource";

const nav = readFileSync("components/Nav.tsx", "utf8");
const view = readFileSync("components/charts/ChartWorkspace.tsx", "utf8");
const HOOK_DIR = "components/charts/hooks";
const hooks = readdirSync(HOOK_DIR).map((f) => readFileSync(`${HOOK_DIR}/${f}`, "utf8")).join("\n");
// Behaviour checks look at the workspace and its hooks together (Phase 3A split them).
const ws = view + "\n" + hooks + "\n" + readFileSync("lib/chartCandlesApi.ts", "utf8");
const uiFiles = ["ChartToolbar", "DrawingToolbar", "IndicatorsMenu", "SettingsMenu", "OhlcLegend"].map((f) => readFileSync(`components/charts/workspace/${f}.tsx`, "utf8")).join("\n");
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
    expect(view).toContain("TradingView Lightweight Charts™");
    expect(view).toContain('href="https://www.tradingview.com/"');
    expect(ws).not.toContain("attributionLogo: false");
    expect(existsSync("NOTICE")).toBe(true);
    expect(readFileSync("NOTICE", "utf8")).toContain("https://www.tradingview.com/");
  });
  it("has every charts.* string in English, Arabic and French", () => {
    const keys = ["eyebrow", "title", "subtitle", "symbolLabel", "quickPairs", "noMatch", "timeframeLabel", "indicators", "loading", "retry", "live", "connecting", "reconnecting", "stale", "disclaimer"];
    const errKeys = ["unsupportedPair", "unsupportedInterval", "network", "unavailable", "noData"];
    for (const l of ["en", "ar", "fr"]) {
      const src = readFileSync(`lib/i18n/${l}.ts`, "utf8");
      const start = src.indexOf("\n  charts: {\n");
      expect(start, l).toBeGreaterThan(-1);
      const block = src.slice(start, src.indexOf("\n  },\n", start));
      for (const k of keys) expect(block, `${l}.${k}`).toMatch(new RegExp(`\\n    ${k}: "[^"]+",`));
      for (const k of errKeys) expect(block, `${l}.err.${k}`).toMatch(new RegExp(`\\n      ${k}: "[^"]+",`));
    }
    for (const k of [...keys.map((x) => `charts.${x}`), ...errKeys.map((x) => `charts.err.${x}`), "nav.charts"]) expect(ws + uiFiles + readFileSync("components/charts/ChartSymbolPicker.tsx", "utf8") + nav).toContain(k.startsWith("charts.err.") ? "charts.err." : k.replace(/^charts\./, "charts."));
  });
  it("adds no drawing persistence, Redis, Clerk or membership gating (Phase 2)", () => {
    expect(view + hooks.replace(/useChartSettings[\s\S]*?\n}\n/, "")).not.toMatch(/redis|@clerk|useAuth/i);
    expect(view).not.toMatch(/localStorage/i);
    for (const f of ["lib/chartDrawings.ts", "lib/chartDrawingEngine.ts", "lib/chartHistory.ts", "components/charts/drawingsPrimitive.ts", "components/charts/drawing/DrawingController.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/localStorage|sessionStorage|indexedDB|redis|@clerk|fetch\(/i);
    }
  });
  it("cleans up the chart, primitive, controller and sockets on unmount / switch", () => {
    expect(ws).toContain("controller.destroy()");
    expect(ws).toContain("detachPrimitive(primitive)");
    expect(ws).toContain("core.chartRef.current?.remove()");
    expect(ws).toContain("unsubscribeCrosshairMove");
    expect(ws).toContain("stream.close()");
    expect(ws).toContain("observer?.disconnect()");
  });
  it("switching timeframe reloads history and re-keys the live socket, keeping drawings", () => {
    expect(hooks).toMatch(/\[core, ready, chartReady, symbol, interval, reloadNonce, paintAll\]/);
    expect(hooks).toMatch(/\[core, dataKey, resync, onCandle\]/);
    expect(hooks).toContain("createHistory<Drawing[]>([])"); // symbol change resets the session (useDrawingSession.reset)
    const fn = view.slice(view.indexOf("const changeSymbol"), view.indexOf("const base ="));
    expect(fn).toContain("drawing.reset()");
    expect(view).toContain("onInterval={setIntervalValue}"); // timeframe change keeps drawings: no reset on that path
  });
  it("keeps ChartWorkspace presentation-only: no chart library, socket or fetch inside it (Phase 3A)", () => {
    expect(view).not.toMatch(/lightweight-charts|createChart|WebSocket|createKlineStream|fetch\(|addEventListener|subscribeCrosshairMove/);
    expect(view.split("\n").length).toBeLessThan(260);
    for (const h of ["useChartQuery", "useChartInstance", "useChartSettings", "useChartIndicators", "useChartData", "useLiveCandles", "useCrosshairCandle", "useDrawingSession", "useChartViewport"]) {
      expect(existsSync(`${HOOK_DIR}/${h}.ts`), h).toBe(true);
      expect(view).toContain(h);
    }
  });
  it("offers the six timeframes including monthly and disables Market Cap honestly", () => {
    const tf = readFileSync("components/charts/workspace/ChartToolbar.tsx", "utf8");
    expect(tf).toContain("CHART_TIMEFRAMES");
    expect(tf).toContain("marketCapUnavailable");
    expect(tf).toMatch(/disabled/);
  });
});
