"use client";

import type { Candle } from "@/lib/marketDataTypes";
import { formatPrice } from "@/lib/binance";
import { formatVolume, summarizeCandle } from "@/lib/chartOhlc";
import { useLanguage } from "@/lib/i18n";

/** Open/high/low/close, change and volume of the hovered (or latest) candle. Overlaid on the chart; ignores pointer input. */
export default function OhlcLegend({ candle }: { candle: Candle | null }) {
  const { t } = useLanguage();
  if (!candle) return null;
  const s = summarizeCandle(candle);
  const tone = s.up ? "text-bull" : "text-bear";
  const item = (k: string, v: string) => (
    <span className="whitespace-nowrap">
      <span className="text-text-muted">{k}</span> <span className={tone}>{v}</span>
    </span>
  );
  return (
    <div className="pointer-events-none absolute start-2 top-1.5 z-10 flex max-w-[calc(100%-5rem)] flex-wrap gap-x-3 gap-y-0.5 rounded bg-surface/70 px-1.5 py-0.5 font-data text-[11px] sm:text-xs" dir="ltr" aria-label="OHLC">
      {item("O", formatPrice(s.open))}
      {item("H", formatPrice(s.high))}
      {item("L", formatPrice(s.low))}
      {item("C", formatPrice(s.close))}
      <span className={`whitespace-nowrap ${tone}`}>
        {s.change >= 0 ? "+" : ""}
        {s.changePct.toFixed(2)}%
      </span>
      <span className="whitespace-nowrap">
        <span className="text-text-muted">{t("charts.ohlcVol")}</span> <span className="text-text">{formatVolume(s.volume)}</span>
      </span>
    </div>
  );
}
