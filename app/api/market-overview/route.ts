import { NextResponse } from "next/server";
import { getFearGreed, getAltcoinSeason, getGlobalMetrics } from "@/lib/coinmarketcap";
import type { FearGreed, AltcoinSeason, GlobalMetrics } from "@/lib/coinmarketcap";
import { getRedis } from "@/lib/userStore";

export const maxDuration = 20;

// Mirrors the market-intel data route's caching shape: one shared cache
// entry so every visitor doesn't trigger their own CoinMarketCap calls,
// refreshed well within CMC's documented update cadence (global metrics
// refresh every few minutes on their side; Fear & Greed and Altcoin
// Season refresh daily), with a longer stale-fallback window for outages.
const CACHE_KEY = "cmc:overview:cache";
const CACHE_TTL_SEC = 300;
const CACHE_KEEP_SEC = 60 * 60;

type SectionStatus = "ok" | "unavailable" | "not_configured";

type Section<T> = { status: SectionStatus; data: T | null };

type Dataset = {
  generatedAt: string;
  devHint: boolean;
  fearGreed: Section<FearGreed>;
  altcoinSeason: Section<AltcoinSeason>;
  globalMetrics: Section<GlobalMetrics>;
};

async function buildDataset(): Promise<Dataset> {
  const devHint = process.env.NODE_ENV !== "production";
  const configured = !!process.env.COINMARKETCAP_API_KEY?.trim();

  if (!configured) {
    const notConfigured: Section<never> = { status: "not_configured", data: null };
    return {
      generatedAt: new Date().toISOString(),
      devHint,
      fearGreed: notConfigured,
      altcoinSeason: notConfigured,
      globalMetrics: notConfigured,
    };
  }

  const [fg, alt, gm] = await Promise.allSettled([getFearGreed(), getAltcoinSeason(), getGlobalMetrics()]);

  function toSection<T>(result: PromiseSettledResult<T>): Section<T> {
    if (result.status === "fulfilled") return { status: "ok", data: result.value };
    console.error("market-overview: upstream call failed", result.reason);
    return { status: "unavailable", data: null };
  }

  return {
    generatedAt: new Date().toISOString(),
    devHint,
    fearGreed: toSection(fg),
    altcoinSeason: toSection(alt),
    globalMetrics: toSection(gm),
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
    console.error("market-overview route failed", err);
    if (redis) {
      const stale = await redis.get<Dataset>(CACHE_KEY);
      if (stale) return NextResponse.json({ ...stale, cached: true, stale: true });
    }
    return NextResponse.json({ error: "market_overview_unavailable" }, { status: 503 });
  }
}
