"use client";

// Live candles: one isolated Binance kline socket for the symbol/timeframe
// whose history is on screen (keyed on `dataKey`). Updates the series in
// place; falls back to `resync` on a gap or when the chart rejects a point.

import { useEffect, useState } from "react";
import { calcEMA } from "@/lib/indicators";
import type { Candle, ChartInterval } from "@/lib/marketDataTypes";
import { createKlineStream, type StreamStatus } from "@/lib/klineStream";
import { applyLiveKline } from "@/lib/chartLive";
import { EMA_DEFS } from "@/lib/chartIndicators";
import { candleColors, withAlpha } from "@/lib/chartSettings";
import { themeColors, toTime, type ChartCore } from "@/components/charts/hooks/chartCore";

export function useLiveCandles(
  core: ChartCore,
  dataKey: string | null,
  resync: (sym: string, tf: ChartInterval) => void,
  onCandle: (c: Candle) => void
): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>("connecting");

  useEffect(() => {
    if (!dataKey) return;
    const [sym, tf] = dataKey.split(":") as [string, ChartInterval];

    const stream = createKlineStream({
      symbol: sym,
      interval: tf,
      onStatus: setStatus,
      onResync: () => resync(sym, tf),
      onKline: (k) => {
        const r = applyLiveKline(core.candlesRef.current, k, tf);
        if (r.kind === "stale") return;
        if (r.kind === "gap") {
          resync(sym, tf);
          return;
        }
        core.candlesRef.set(r.candles);
        const time = toTime(r.candle.openTime);
        const colors = candleColors(core.settingsRef.current, themeColors());
        try {
          core.candleSeriesRef.current?.update({ time, open: r.candle.open, high: r.candle.high, low: r.candle.low, close: r.candle.close });
          core.volumeSeriesRef.current?.update({ time, value: r.candle.volume, color: withAlpha(r.candle.close >= r.candle.open ? colors.up : colors.down) });
          for (const e of EMA_DEFS) {
            const pts = calcEMA(r.candles, e.period);
            const lastPt = pts[pts.length - 1];
            if (lastPt && toTime(lastPt.time) === time) core.emaSeriesRef.current[e.period]?.update({ time, value: lastPt.value });
          }
          if (r.kind === "append") core.primitiveRef.current?.setState({ times: r.candles.map((c) => Math.floor(c.openTime / 1000)) });
        } catch {
          resync(sym, tf); // the chart rejected an out-of-order point: rebuild from history instead of drifting
        }
        onCandle(r.candle);
      },
    });

    const wake = () => {
      if (document.visibilityState === "visible") stream.kick();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      stream.close();
    };
  }, [core, dataKey, resync, onCandle]);

  return status;
}
