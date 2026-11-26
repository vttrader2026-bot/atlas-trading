import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(f, "utf8");
const view = read("components/charts/ChartWorkspace.tsx");
const bar = read("components/charts/workspace/ChartToolbar.tsx");
const side = read("components/charts/workspace/ChartSidebar.tsx");
const rail = read("components/charts/workspace/DrawingToolbar.tsx");
const picker = read("components/charts/ChartSymbolPicker.tsx");
const status = read("components/charts/workspace/ChartStatusBar.tsx");
const lang = (l: string) => {
  const src = read(`lib/i18n/${l}.ts`);
  const start = src.indexOf("\n  charts: {\n");
  return src.slice(start, src.indexOf("\n  },\n", start));
};

describe("desktop workspace (Phase 3B part 2)", () => {
  it("is full width with the toolbar, rail, chart, side panel and status bar inside the one fullscreen panel", () => {
    expect(view).not.toContain("max-w-7xl");
    const panel = view.slice(view.indexOf("<section"), view.indexOf("</section>"));
    for (const part of ["<ChartToolbar", "<DrawingToolbar", "containerRef", "ChartStatusBar", "sidebar"]) expect(panel, part).toContain(part);
  });
  it("puts the symbol search inside the toolbar so it works in fullscreen", () => {
    expect(bar).toContain("symbolSlot");
    expect(view).toMatch(/symbolSlot=\{<ChartSymbolPicker .*compact/);
    expect(view.slice(view.indexOf("</section>"))).not.toContain("<ChartSymbolPicker");
    expect(picker).toContain("compact");
  });
  it("has a provider selector that honestly offers only Binance Spot", () => {
    expect(bar).toContain("charts.providerLabel");
    expect((bar.match(/<option /g) ?? []).length).toBe(1);
  });
  it("rail scrolls on short screens, shrinks, and its tooltip/popover can't be clipped", () => {
    expect(rail).toContain("sm:overflow-y-auto");
    expect(rail).toContain("max-height:820px");
    expect(rail).toContain("fixed z-50");
    expect(read("components/charts/workspace/Popover.tsx")).toContain("fixed");
  });
  it("side panel: four tabs reusing existing ATLAS sources, nothing simulated", () => {
    for (const id of ["watchlist", "market", "trade", "data"]) expect(side).toContain(`"${id}"`);
    expect(side).toContain("useWatchlist");
    expect(side).toContain("useLiveTickers");
    expect(side).toContain("StarButton");
    for (const href of ["/watchlist", "/radar", "/market-intelligence", "/analyzer?pair=", "/trade-plan", "/trade-feed"]) expect(side).toContain(href);
    expect(side).not.toMatch(/Math\.random|setInterval|fake|mock/i);
    expect(side).toContain('target="_blank"'); // links must not discard the in-memory drawings
  });
  it("side panel is collapsible and opens as a bottom sheet below 1024px", () => {
    const hook = read("components/charts/hooks/useChartLayout.ts");
    expect(hook).toContain("(min-width: 1024px)");
    expect(view).toContain('variant={layout.desktop ? "side" : "sheet"}');
    expect(bar).toContain("sidebar.onToggle");
    expect(side).toContain("charts.panelHide");
  });
  it("status bar shows live status, exchange, symbol and price", () => {
    for (const k of ["charts.live", "charts.reconnecting", "Binance Spot", "formatPrice"]) expect(status).toContain(k);
  });
  it("keeps the Lightweight Charts attribution visible in fullscreen too", () => {
    expect(view).toMatch(/\{fs && \(\s*<span[^>]*>\s*TradingView Lightweight Charts™/);
    expect(view).toContain('href="https://www.tradingview.com/"');
  });
});

describe("phone layout", () => {
  it("is a dedicated arrangement: compact order, big touch targets, fullscreen button without text, chart-first height", () => {
    expect(bar).toContain("h-10 sm:h-9");
    expect(bar).toMatch(/order-1 min-w-0 flex-1/);
    expect(bar).toContain("lg:!block"); // provider select only when there is room (keeps landscape phones to one toolbar row) // symbol first and flexible
    expect(bar).toContain("order-3 flex w-full overflow-x-auto"); // timeframes get their own row
    expect(view).toContain("h-[calc(100dvh-7.5rem)]");
    expect(rail).toContain("h-10 w-10"); // 40px buttons on phones
  });
});

describe("i18n for the new strings", () => {
  const keys = ["panelShow", "panelHide", "providerLabel", "tabWatchlist", "tabMarket", "tabTrade", "tabData", "sidePanel", "wlEmpty", "wlOpen", "mkTitle", "mkRadar", "mkLoading", "tradeIntro", "tradeAnalyze", "tradePlan", "tradeFeed", "tradeOpensTab", "dataTitle", "dataChange", "dataHigh", "dataLow", "dataVolume", "dataLast", "dataFrame", "dataSource", "dataState", "dataForming", "dataClosed", "dataWaiting"];
  it("exist in English, Arabic and French", () => {
    for (const l of ["en", "ar", "fr"]) for (const k of keys) expect(lang(l), `${l}.${k}`).toMatch(new RegExp(`\\n    ${k}: "[^"]+",`));
  });
  it("components exist", () => {
    for (const f of ["components/charts/workspace/ChartSidebar.tsx", "components/charts/workspace/ChartStatusBar.tsx", "components/charts/hooks/useChartLayout.ts"]) expect(existsSync(f), f).toBe(true);
  });
});
