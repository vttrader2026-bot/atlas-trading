"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAllTickers24h, getSpotTradingSymbols, type Ticker24h } from "@/lib/binance";
import { buildRadarRows, type RadarRow } from "@/lib/radar";

export const WATCHLIST_REFRESH_MS = 45_000; // inside the 30-60s window

export type MarketSnapshot = {
  tickers: Map<string, Ticker24h>;
  radar: Map<string, RadarRow>; // built with the app's own Radar rules
  spot: Set<string> | null; // symbols trading on Binance spot (null = list unavailable)
};

/**
 * Same data source and same Radar rules as the Radar page: ONE request for
 * every ticker (plus the cached spot-symbol list), refreshed every ~45s but
 * only while the page is visible. A failed refresh keeps the last data.
 */
export function useWatchlistMarket() {
  const [snap, setSnap] = useState<MarketSnapshot | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const last = useRef(0);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const [all, spot] = await Promise.all([getAllTickers24h(), getSpotTradingSymbols()]);
      const btc = all.find((t) => t.symbol === "BTCUSDT");
      const btcChange = btc ? parseFloat(btc.priceChangePercent) : 0;
      const rows = buildRadarRows(all, Number.isFinite(btcChange) ? btcChange : 0, spot);
      setSnap({
        tickers: new Map(all.map((t) => [t.symbol, t])),
        radar: new Map(rows.map((r) => [r.ticker.symbol, r])),
        spot,
      });
      const now = Date.now();
      last.current = now;
      setUpdatedAt(now);
      setFailed(false);
    } catch {
      setFailed(true); // keep whatever we had
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const start = () => {
      stop();
      timer = setInterval(() => void load(), WATCHLIST_REFRESH_MS);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - last.current > WATCHLIST_REFRESH_MS / 2) void load();
        start();
      } else {
        stop();
      }
    };
    const first = setTimeout(() => {
      if (document.visibilityState === "visible") void load();
    }, 0);
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearTimeout(first); stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  return { snap, updatedAt, failed, reload: load };
}
