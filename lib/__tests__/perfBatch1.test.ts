import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { cdnCache } from "@/lib/publicCache";

const read = (p: string) => readFileSync(p, "utf8");
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

const getCandles = vi.fn();
vi.mock("@/lib/marketData", async (orig) => ({ ...(await orig<typeof import("@/lib/marketData")>()), getCandles: (...a: unknown[]) => getCandles(...a) }));

describe("CDN caching only for public market data", () => {
  it("builds a public s-maxage header", () => {
    expect(cdnCache(60, 120)).toEqual({ "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" });
  });
  it("only the three public market routes use it; no route that reads a session, plan or user does", () => {
    const users = walk("app/api").filter((f) => f.endsWith("route.ts") && read(f).includes("publicCache")).map((f) => f.replace(/\\/g, "/")).sort();
    expect(users).toEqual(["app/api/chart/klines/route.ts", "app/api/market-intel/data/route.ts", "app/api/market-overview/route.ts"]);
    for (const f of users) expect(read(f)).not.toMatch(/auth\(|currentUser|getUserPlan|cookies\(|requireUser/);
    for (const f of ["app/api/trade-feed/route.ts", "app/api/investment-signals/route.ts"]) expect(read(f)).not.toContain("publicCache");
  });
  it("market data routes cache only successful responses, never errors or stale fallbacks", () => {
    for (const f of ["app/api/market-overview/route.ts", "app/api/market-intel/data/route.ts"]) {
      const s = read(f);
      expect(s.match(/cdnCache\(60, 120\)/g)?.length).toBe(2); // fresh + cached-by-redis
      expect(s).toMatch(/stale: true \}\);/); // the stale fallback line has no headers
      expect(s).toMatch(/status: 503 \}\);/);
    }
  });
  it("klines: short public cache on fresh candles; stale or failed responses are not cached", async () => {
    const { GET } = await import("@/app/api/chart/klines/route");
    const req = (q = "symbol=BTC&interval=1h&limit=5") => new Request(`http://x/api/chart/klines?${q}`) as unknown as import("next/server").NextRequest;
    getCandles.mockResolvedValueOnce({ pair: "BTCUSDT", candles: [], stale: false });
    expect((await GET(req())).headers.get("cache-control")).toBe("public, s-maxage=10, stale-while-revalidate=10");
    getCandles.mockResolvedValueOnce({ pair: "BTCUSDT", candles: [], stale: true });
    expect((await GET(req())).headers.get("cache-control")).toBe("no-store");
    expect((await GET(req("interval=1h"))).headers.get("cache-control")).toBeNull(); // 400: missing symbol
  });
});

describe("lazy root-layout extras", () => {
  const layout = read("app/layout.tsx");
  it("WhatsApp button, Welcome popup and email reminder load lazily after idle; the PWA, Clerk and JournalSync pieces stay eager", () => {
    const lazy = read("components/LazyGlobals.tsx");
    for (const c of ["WhatsAppSupportButton", "WelcomePopup", "EmailRecoveryNotice"]) {
      expect(lazy).toContain(`const ${c} = dynamic(() => import("@/components/${c}"), { ssr: false });`);
      expect(layout).not.toContain(`import ${c} `);
    }
    expect(lazy).toContain("requestIdleCallback");
    expect(layout).toContain("<LazyGlobals />");
    for (const eager of ["<RegisterServiceWorker />", "<InstallProvider>", "<JournalSync />", "<ClerkProvider", "<LanguageProvider>", "<Nav />", "<QuickNav />", "<Footer />"]) expect(layout).toContain(eager);
  });
  it("fonts: Sora and JetBrains Mono no longer preload globally, Inter still does, all families and variables unchanged", () => {
    const block = (v: string) => layout.slice(layout.lastIndexOf("localFont({", layout.indexOf(v)), layout.indexOf("});", layout.indexOf(v)));
    expect(block('"--font-heading-family"')).toContain("preload: false");
    expect(block('"--font-jetbrains-mono"')).toContain("preload: false");
    expect(block('"--font-sans"')).not.toContain("preload");
    expect(block('"--font-heading-family"')).toContain('weight: "100 800"');
  });
});

describe("coin icons, watchlist ticker, charts, analyzer", () => {
  it("coin icons are lazy, async-decoded and sized, and still use the same icon URL and fallback", () => {
    const mb = read("components/market/MarketBits.tsx");
    expect(mb).toContain("assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png");
    for (const a of ["width={size}", "height={size}", 'loading="lazy"', 'decoding="async"', "setFailed(true)"]) expect(mb).toContain(a);
    const tf = read("app/trade-feed/page.tsx");
    for (const a of ["width={32}", "height={32}", 'loading="lazy"', 'decoding="async"', "setImgFailed(true)"]) expect(tf).toContain(a);
  });
  it("the Watchlist page no longer ticks every second; the ticker lives in <UpdatedAgo />", async () => {
    const page = read("app/watchlist/page.tsx");
    expect(page).not.toMatch(/setNow|setInterval/);
    expect(page).toContain("<UpdatedAgo updatedAt={updatedAt} t={t} />");
    const UpdatedAgo = (await import("@/components/watchlist/UpdatedAgo")).default;
    const t = (k: string) => (k === "watchlist.updatedAgo" ? "Updated {n}s ago" : "Updated {n}m ago");
    expect(renderToStaticMarkup(createElement(UpdatedAgo, { updatedAt: Date.now() - 5000, t }))).toMatch(/Updated [45]s ago/);
    expect(renderToStaticMarkup(createElement(UpdatedAgo, { updatedAt: Date.now() - 125_000, t }))).toBe("Updated 2m ago");
    const src = read("components/watchlist/UpdatedAgo.tsx");
    expect(src).toContain("visibilitychange");
    expect(src).toContain("1000");
  });
  it("Radar and Market Intelligence load the chart panel only when opened", () => {
    for (const f of ["app/radar/page.tsx", "app/market-intelligence/page.tsx"]) {
      const s = read(f);
      expect(s).toContain('const AnalysisPanel = dynamic(() => import("@/components/charts/AnalysisPanel"), { ssr: false });');
      expect(s).not.toContain('import AnalysisPanel from');
      expect(s).toMatch(/\{chartSymbol && <AnalysisPanel /);
    }
  });
  it("Analyzer reserves the banner height before Clerk loads and keeps its content in the server HTML", () => {
    const s = read("app/analyzer/page.tsx");
    expect(s).toContain("const BANNER_SPACE =");
    expect(s).toContain("{!isLoaded && <div aria-hidden className={BANNER_SPACE} />}");
    expect(s).toContain("{isLoaded && !isSignedIn && (");
    expect(s).not.toContain("<Suspense fallback={null}>");
    expect(s.match(/<AnalyzerHeader \/>/g)?.length).toBe(2);
  });
});
