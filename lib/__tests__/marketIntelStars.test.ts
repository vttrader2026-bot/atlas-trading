import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeSymbol } from "@/lib/watchlist";
import { dictionaries } from "@/lib/i18n";

const page = readFileSync("app/market-intelligence/page.tsx", "utf8");
const star = readFileSync("components/watchlist/StarButton.tsx", "utf8");

function fn(name: string): string {
  const start = page.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(0);
  const next = page.indexOf("\nfunction ", start + 1);
  return page.slice(start, next === -1 ? undefined : next);
}

describe("Market Intelligence favorites reuse the Watchlist system", () => {
  it("uses the shared StarButton and creates no second favorites system", () => {
    expect(page).toContain('import StarButton from "@/components/watchlist/StarButton"');
    expect(page).not.toMatch(/localStorage|sessionStorage|\/api\/me\/watchlist|favorites?Store|useState<.*favorite/i);
    expect((page.match(/<StarButton /g) ?? []).length).toBe(2);
  });
  it("StarButton still goes through the shared store, with limits, and stops click propagation", () => {
    expect(star).toContain('from "@/lib/useWatchlist"');
    expect(star).toContain("e.stopPropagation()");
    expect(star).toContain("onServerLimit");
    expect(star).toContain("wl.add(sym)");
  });
  it("every Market Intelligence base symbol maps to a valid watchlist symbol", () => {
    for (const base of ["BTC", "ETH", "1INCH", "SOL", "HYPE"]) expect(normalizeSymbol(base)).toBe(`${base}USDT`);
  });
});

describe("desktop table", () => {
  const row = fn("AssetRow");
  it("has a star cell outside the chart button", () => {
    expect(row).toContain("<StarButton symbol={asset.symbol} />");
    const starAt = row.indexOf("<StarButton");
    const btnOpen = row.indexOf("<button");
    const btnClose = row.indexOf("</button>");
    expect(starAt).toBeGreaterThan(-1);
    expect(starAt < btnOpen || starAt > btnClose).toBe(true);
  });
  it("header cell count equals the empty-state colSpan and the row cell count", () => {
    const head = page.slice(page.indexOf("<thead"), page.indexOf("</thead>"));
    const ths = (head.match(/<th /g) ?? []).length;
    const span = Number(/colSpan=\{(\d+)\}/.exec(page)?.[1]);
    expect(span).toBe(ths);
    const tds = (row.match(/<td |<PerfCell/g) ?? []).length;
    expect(tds).toBe(ths);
  });
  it("labels the star column for screen readers with an existing translated key", () => {
    expect(page).toContain('language.t("nav.watchlist")');
    expect(page).toContain("sr-only");
    for (const l of ["en", "fr", "ar"] as const) {
      expect((dictionaries[l].nav as Record<string, string>).watchlist.length).toBeGreaterThan(0);
    }
  });
});

describe("mobile card", () => {
  const card = fn("AssetCardMobile");
  it("never nests the star inside the card button", () => {
    const open = card.indexOf("<button");
    const close = card.indexOf("</button>");
    const starAt = card.indexOf("<StarButton");
    expect(open).toBeGreaterThan(-1);
    expect(starAt).toBeGreaterThan(close);
    // only one card button, and the star sits next to it in the same flex row
    expect((card.match(/<button/g) ?? []).length).toBe(1);
    expect(card.slice(close, starAt)).not.toContain("<button");
  });
  it("uses logical (RTL-safe) spacing for the star and the card", () => {
    expect(card).toMatch(/<StarButton[^>]*pe-2/);
    expect(card).toContain("ps-4 pe-1");
    expect(card).not.toMatch(/\b(pl|pr|ml|mr)-\d/);
  });
  it("still opens the chart from the card button", () => {
    expect(card).toContain("onViewChart(asset.symbol)");
  });
});
