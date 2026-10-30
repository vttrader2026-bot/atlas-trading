"use client";

// Real data for the homepage, fetched once per section family. Nothing here
// is invented: if a source fails the value stays null and the UI says so.
import { useEffect, useState } from "react";
import { getAllTickers24h, getKlines, getSpotTradingSymbols, type Ticker24h } from "@/lib/binance";
import { buildRadarRows, type RadarRow } from "@/lib/radar";
import type { PublishedTrade } from "@/lib/tradeFeed";
import type { RankedAsset } from "@/lib/marketIntelCompute";
import type { FearGreed, AltcoinSeason, GlobalMetrics } from "@/lib/coinmarketcap";

const MARKET_REFRESH_MS = 30_000;
const OVERVIEW_REFRESH_MS = 5 * 60 * 1000;
const KLINE_REFRESH_MS = 5 * 60 * 1000;

export type HomeMarket = {
  tickers: Record<string, Ticker24h>; // BTC / ETH / SOL
  rows: RadarRow[] | null; // same Radar rules as /radar
  btcSeries: number[] | null; // last 24 hourly closes of BTC/USDT
  failed: boolean;
  loaded: boolean;
};

const PICK = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

export function useHomeMarket(): HomeMarket {
  const [state, setState] = useState<HomeMarket>({ tickers: {}, rows: null, btcSeries: null, failed: false, loaded: false });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [all, spot] = await Promise.all([getAllTickers24h(), getSpotTradingSymbols()]);
        if (cancelled) return;
        const btc = all.find((t) => t.symbol === "BTCUSDT");
        const btcChange = btc ? parseFloat(btc.priceChangePercent) : 0;
        const rows = buildRadarRows(all, Number.isFinite(btcChange) ? btcChange : 0, spot);
        const tickers: Record<string, Ticker24h> = {};
        for (const s of PICK) {
          const t = all.find((x) => x.symbol === s);
          if (t) tickers[s] = t;
        }
        setState((p) => ({ ...p, tickers, rows, failed: false, loaded: true }));
      } catch {
        if (!cancelled) setState((p) => ({ ...p, failed: true, loaded: true }));
      }
    }
    async function loadSeries() {
      try {
        const k = await getKlines("BTCUSDT", "1h", 24);
        const closes = k.map((x) => x.close).filter((n) => Number.isFinite(n) && n > 0);
        if (!cancelled && closes.length >= 8) setState((p) => ({ ...p, btcSeries: closes }));
      } catch {
        /* keep whatever we had */
      }
    }
    load();
    loadSeries();
    const a = setInterval(load, MARKET_REFRESH_MS);
    const b = setInterval(loadSeries, KLINE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  return state;
}

type SectionStatus = "ok" | "unavailable" | "not_configured";
type Section<T> = { status: SectionStatus; data: T | null };
export type MarketOverviewData = {
  generatedAt: string;
  devHint: boolean;
  fearGreed: Section<FearGreed>;
  altcoinSeason: Section<AltcoinSeason>;
  globalMetrics: Section<GlobalMetrics>;
  stale?: boolean;
  error?: string;
};

export function useMarketOverview() {
  const [data, setData] = useState<MarketOverviewData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/market-overview", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || json.error) return setFailed(true);
        setData(json as MarketOverviewData);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    load();
    const id = setInterval(load, OVERVIEW_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return { overview: data, failed, loading: data === null && !failed };
}

export function useIntelAssets() {
  const [assets, setAssets] = useState<RankedAsset[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/market-intel/data", { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok || j.error || !Array.isArray(j.assets)) return setFailed(true);
        setAssets([...(j.assets as RankedAsset[])].sort((a, b) => a.rank - b.rank));
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);
  return { assets, failed };
}

export function useLatestTrades(n = 3) {
  const [trades, setTrades] = useState<PublishedTrade[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/trade-feed")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTrades(Array.isArray(d.trades) ? d.trades.slice(0, n) : []);
      })
      .catch(() => !cancelled && setTrades([]));
    return () => {
      cancelled = true;
    };
  }, [n]);
  return trades;
}
