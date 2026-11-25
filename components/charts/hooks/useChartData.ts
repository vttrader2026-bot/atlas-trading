"use client";

// Historical candles: (re)loads whenever the symbol or timeframe changes or on
// retry, paints every series, and offers an in-place `resync` (after a
// reconnect or a detected gap) that keeps the user's zoom. Stale responses are
// dropped by sequence number.

import { useCallback, useEffect, useRef, useState } from "react";
import { priceDecimals } from "@/lib/binance";
import { calcEMA } from "@/lib/indicators";
import type { Candle, ChartInterval } from "@/lib/marketDataTypes";
import { fetchCandles } from "@/lib/chartCandlesApi";
import { EMA_DEFS } from "@/lib/chartIndicators";
import { candleColors, withAlpha } from "@/lib/chartSettings";
import { themeColors, toTime, type ChartCore } from "@/components/charts/hooks/chartCore";

export type LoadState = { status: "loading" } | { status: "ready"; stale: boolean } | { status: "error"; code: string };

export function useChartData(core: ChartCore, p: { ready: boolean; chartReady: boolean; symbol: string; interval: ChartInterval }) {
  const { ready, chartReady, symbol, interval } = p;
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [dataKey, setDataKey] = useState<string | null>(null); // "BTCUSDT:1h" once history for it is on the chart
  const [lastCandle, setLastCandle] = useState<Candle | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const seqRef = useRef(0);
  const resyncingRef = useRef(false);

  /** Replaces every series' data from `candles` (initial load and resync only — never per live tick). */
  const paintAll = useCallback(
    (candles: Candle[], fit: boolean) => {
      const cs = core.candleSeriesRef.current;
      if (!cs) return;
      const colors = candleColors(core.settingsRef.current, themeColors());
      cs.setData(candles.map((c) => ({ time: toTime(c.openTime), open: c.open, high: c.high, low: c.low, close: c.close })));
      core.volumeSeriesRef.current?.setData(candles.map((c) => ({ time: toTime(c.openTime), value: c.volume, color: withAlpha(c.close >= c.open ? colors.up : colors.down) })));
      for (const e of EMA_DEFS) {
        core.emaSeriesRef.current[e.period]?.setData(calcEMA(candles, e.period).map((pt) => ({ time: toTime(pt.time), value: pt.value })));
      }
      core.primitiveRef.current?.setState({ times: candles.map((c) => Math.floor(c.openTime / 1000)) });
      const lastClose = candles[candles.length - 1]?.close;
      if (lastClose) {
        const precision = priceDecimals(lastClose);
        cs.applyOptions({ priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
      }
      if (fit) core.chartRef.current?.timeScale().fitContent();
    },
    [core]
  );

  useEffect(() => {
    if (!ready || !chartReady) return;
    const seq = ++seqRef.current;
    /* eslint-disable react-hooks/set-state-in-effect -- loading state must flip as soon as the pair/timeframe changes */
    setLoad({ status: "loading" });
    setDataKey(null);
    setLastCandle(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    core.candlesRef.set([]);
    core.candleSeriesRef.current?.setData([]);
    core.volumeSeriesRef.current?.setData([]);
    for (const e of EMA_DEFS) core.emaSeriesRef.current[e.period]?.setData([]);
    core.primitiveRef.current?.setState({ times: [], draft: null, measure: null });

    fetchCandles(symbol, interval)
      .then(({ candles, stale }) => {
        if (seqRef.current !== seq) return;
        if (candles.length === 0) {
          setLoad({ status: "error", code: "NO_DATA" });
          return;
        }
        core.candlesRef.set(candles);
        paintAll(candles, true);
        setLastCandle(candles[candles.length - 1]);
        setLoad({ status: "ready", stale });
        setDataKey(`${symbol}:${interval}`);
      })
      .catch((err: { code?: string }) => {
        if (seqRef.current !== seq) return;
        setLoad({ status: "error", code: err?.code || "UNKNOWN_ERROR" });
      });
  }, [core, ready, chartReady, symbol, interval, reloadNonce, paintAll]);

  // Takes the symbol/timeframe explicitly so its identity never changes — a changing callback would restart the live socket.
  const resync = useCallback(
    (sym: string, tf: ChartInterval) => {
      if (resyncingRef.current) return;
      const seq = seqRef.current;
      resyncingRef.current = true;
      fetchCandles(sym, tf)
        .then(({ candles }) => {
          if (seqRef.current !== seq || candles.length === 0) return;
          core.candlesRef.set(candles);
          paintAll(candles, false);
          setLastCandle(candles[candles.length - 1]);
        })
        .catch(() => {})
        .finally(() => {
          resyncingRef.current = false;
        });
    },
    [core, paintAll]
  );

  const retry = useCallback(() => setReloadNonce((n) => n + 1), []);

  return { load, dataKey, lastCandle, setLastCandle, resync, retry };
}
