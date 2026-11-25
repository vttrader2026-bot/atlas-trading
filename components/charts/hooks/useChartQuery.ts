"use client";

// Symbol + timeframe state, initialised from ?symbol=&tf= (validated) after
// mount and mirrored back into the URL without adding history entries.

import { useEffect, useState } from "react";
import type { ChartInterval } from "@/lib/marketDataTypes";
import { DEFAULT_CHART_INTERVAL, DEFAULT_CHART_SYMBOL, parseChartParams } from "@/lib/chartLive";

export function useChartQuery() {
  const [ready, setReady] = useState(false); // URL params read (SSR cannot see them)
  const [symbol, setSymbol] = useState(DEFAULT_CHART_SYMBOL);
  const [interval, setIntervalValue] = useState<ChartInterval>(DEFAULT_CHART_INTERVAL);

  useEffect(() => {
    const p = parseChartParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of the URL after mount */
    setSymbol(p.symbol);
    setIntervalValue(p.interval);
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!ready) return;
    const qs = `?symbol=${symbol}&tf=${interval}`;
    if (window.location.search !== qs) window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs}`);
  }, [ready, symbol, interval]);

  return { ready, symbol, setSymbol, interval, setInterval: setIntervalValue };
}
