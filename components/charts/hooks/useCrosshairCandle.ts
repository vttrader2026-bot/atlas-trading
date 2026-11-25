"use client";

// The candle under the crosshair, for the OHLC legend (null when the pointer
// is off the chart). Cleared whenever the data on screen is replaced.

import { useEffect, useRef, useState } from "react";
import type { Candle } from "@/lib/marketDataTypes";
import type { ChartCore } from "@/components/charts/hooks/chartCore";

function findByTime(arr: Candle[], time: number): Candle | null {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ct = Math.floor(arr[mid].openTime / 1000);
    if (ct === time) return arr[mid];
    if (ct < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

export function useCrosshairCandle(core: ChartCore, chartReady: boolean, dataKey: string | null): Candle | null {
  const [hover, setHover] = useState<Candle | null>(null);
  const hoverTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const chart = core.chartRef.current;
    if (!chartReady || !chart) return;
    const onCrosshair = (param: { time?: unknown }) => {
      const time = typeof param.time === "number" ? param.time : null;
      if (time === hoverTimeRef.current) return;
      hoverTimeRef.current = time;
      setHover(time === null ? null : findByTime(core.candlesRef.current, time));
    };
    chart.subscribeCrosshairMove(onCrosshair);
    return () => chart.unsubscribeCrosshairMove(onCrosshair);
  }, [core, chartReady]);

  useEffect(() => {
    // New data on screen (symbol/timeframe change): forget the hovered candle.
    hoverTimeRef.current = null;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- reset must follow the data key */
    setHover(null);
  }, [dataKey]);

  return hover;
}
