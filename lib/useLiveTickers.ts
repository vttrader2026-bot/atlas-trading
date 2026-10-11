"use client";

import { useEffect, useState } from "react";
import { Ticker24h } from "@/lib/binance";
import { subscribe, getCachedTickers } from "@/lib/binanceStream";

/**
 * Live-updating map of USDT ticker data (symbol -> Ticker24h), fed by
 * Binance's public WebSocket stream instead of REST polling. All components
 * using this hook share one underlying connection (see lib/binanceStream).
 */
export function useLiveTickers(): Record<string, Ticker24h> {
  const [tickers, setTickers] = useState<Record<string, Ticker24h>>(getCachedTickers);

  useEffect(() => {
    return subscribe((next) => setTickers({ ...next }));
  }, []);

  return tickers;
}
