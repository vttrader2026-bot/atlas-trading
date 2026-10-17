import { NextResponse } from "next/server";
import { getAllTickers24h, getKlines, type Kline, type Ticker24h } from "@/lib/binance";
import { ASSET_CATEGORY_MAP, BASELINE_DATE, CATEGORY_META, TRACKED_SYMBOLS } from "@/lib/marketIntelAssets";
import { computeAssetMetrics, rankAssets, type RankedAsset } from "@/lib/marketIntelCompute";
import { getBaselineSnapshot, getUniverseLog } from "@/lib/marketIntelSnapshots";
import { getRedis } from "@/lib/userStore";

export const maxDuration = 30;

const CACHE_KEY = "mi:cache:data";
const CACHE_TTL_SEC = 300; // refresh every 5 minutes
const CACHE_KEEP_SEC = 60 * 60; // keep a stale copy up to 1h as an outage fallback

type Dataset = {
  generatedAt: string;
  baselineDate: string;
  assets: RankedAsset[];
  sincePerf: Array<{ symbol: string; sincePct: number | null }>;
  btcSincePct: number | null;
  universeLog: Awaited<ReturnType<typeof getUniverseLog>>;
  categoryMeta: typeof CATEGORY_META;
};

async function buildDataset(): Promise<Dataset> {
  const tickers = await getAllTickers24h();
  const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

  const symbols = Array.from(new Set(["BTC", ...TRACKED_SYMBOLS]));
  const klinesMap = new Map<string, Kline[]>();

  // Bounded concurrency so we don't fire 80+ requests at once or blow the
  // function's time budget.
  const concurrency = 8;
  let cursor = 0;
  async function worker() {
    while (cursor < symbols.length) {
      const i = cursor++;
      const sym = symbols[i];
      try {
        const k = await getKlines(`${sym}USDT`, "1d", 32);
        klinesMap.set(sym, k);
      } catch {
        klinesMap.set(sym, []);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const now = Date.now();

  function metricsFor(sym: string) {
    const ticker: Ticker24h | undefined = tickerMap.get(`${sym}USDT`);
    if (!ticker) return null;
    const klines = klinesMap.get(sym) ?? [];
    return computeAssetMetrics(sym, klines, ticker, now);
  }

  const btcMetrics = metricsFor("BTC");
  const metricsList = TRACKED_SYMBOLS.map((sym) => metricsFor(sym)).filter(
    (m): m is NonNullable<typeof m> => m !== null,
  );

  const ranked = rankAssets(metricsList, ASSET_CATEGORY_MAP, btcMetrics);

  const baseline = await getBaselineSnapshot();
  const universeLog = await getUniverseLog();

  const sincePerf = ranked.map((r) => {
    const baselinePrice = baseline?.prices?.[r.symbol];
    const sincePct = baselinePrice ? ((r.price - baselinePrice) / baselinePrice) * 100 : null;
    return { symbol: r.symbol, sincePct };
  });

  const btcSincePct =
    baseline?.btcPrice && btcMetrics ? ((btcMetrics.price - baseline.btcPrice) / baseline.btcPrice) * 100 : null;

  return {
    generatedAt: new Date().toISOString(),
    baselineDate: baseline?.date ?? BASELINE_DATE,
    assets: ranked,
    sincePerf,
    btcSincePct,
    universeLog,
    categoryMeta: CATEGORY_META,
  };
}

export async function GET() {
  const redis = getRedis();

  try {
    if (redis) {
      const cached = await redis.get<Dataset>(CACHE_KEY);
      if (cached && Date.now() - new Date(cached.generatedAt).getTime() < CACHE_TTL_SEC * 1000) {
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    const data = await buildDataset();
    if (redis) {
      await redis.set(CACHE_KEY, data, { ex: CACHE_KEEP_SEC });
    }
    return NextResponse.json({ ...data, cached: false });
  } catch (err) {
    console.error("market-intel data route failed", err);
    if (redis) {
      const stale = await redis.get<Dataset>(CACHE_KEY);
      if (stale) return NextResponse.json({ ...stale, cached: true, stale: true });
    }
    return NextResponse.json({ error: "market_data_unavailable" }, { status: 503 });
  }
}
