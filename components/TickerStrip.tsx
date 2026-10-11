"use client";

import { useMemo } from "react";
import { formatPrice } from "@/lib/binance";
import { useLiveTickers } from "@/lib/useLiveTickers";

export default function TickerStrip() {
  const tickers = useLiveTickers();

  const top = useMemo(() => {
    return Object.values(tickers)
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 14);
  }, [tickers]);

  if (top.length === 0) return <div className="h-9 border-b border-line" />;

  const items = [...top, ...top];

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
