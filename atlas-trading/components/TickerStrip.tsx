"use client";

import { useEffect, useState } from "react";
import { getAllTickers24h, formatPrice, Ticker24h } from "@/lib/binance";

export default function TickerStrip() {
  const [tickers, setTickers] = useState<Ticker24h[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await getAllTickers24h();
        if (cancelled) return;
        const top = [...all]
          .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
          .slice(0, 14);
        setTickers(top);
      } catch {
        // strip stays empty until the next tick; ticker page shows the real error state
      }
    }
    load();
    const id = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (tickers.length === 0) return <div className="h-9 border-b border-line" />;

  const items = [...tickers, ...tickers];

  return (
    <div className="marquee-wrap h-9 border-b border-line bg-surface overflow-hidden">
      <div className="marquee-track h-9 items-center">
        {items.map((t, i) => {
          const change = parseFloat(t.priceChangePercent);
          const positive = change >= 0;
          return (
            <div
              key={`${t.symbol}-${i}`}
              className="flex items-center gap-2 px-4 text-xs font-data whitespace-nowrap"
            >
              <span className="text-text-muted">{t.symbol.replace("USDT", "/USDT")}</span>
              <span>${formatPrice(t.lastPrice)}</span>
              <span className={positive ? "text-bull" : "text-bear"}>
                {positive ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
