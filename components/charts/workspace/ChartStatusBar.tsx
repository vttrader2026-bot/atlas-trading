"use client";

import type { ReactNode } from "react";
import { useLanguage } from "@/lib/i18n";
import { formatPrice } from "@/lib/binance";
import type { StreamStatus } from "@/lib/klineStream";

/** Bottom status bar: live connection, exchange, symbol/timeframe and the current price (all from the chart's own live data). */
export default function ChartStatusBar(p: { base: string; tfLabel: string; price: number | null; up: boolean; ready: boolean; liveStatus: StreamStatus; stale: boolean; children?: ReactNode }) {
  const { t } = useLanguage();
  const live = !p.ready ? t("charts.loading") : p.liveStatus === "live" ? t("charts.live") : p.liveStatus === "reconnecting" ? t("charts.reconnecting") : t("charts.connecting");
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-line px-3 py-1.5 text-xs text-text-muted" role="status">
      <span className="inline-flex items-center gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${p.ready && p.liveStatus === "live" ? "bg-bull" : "bg-gold"}`} aria-hidden="true" />
        {live}
      </span>
      <span>Binance Spot</span>
      <h2 className="font-data font-semibold text-text">
        {p.base}/USDT <span className="font-normal text-text-muted">· {p.tfLabel}</span>
      </h2>
      {p.price !== null && (
        <span className={`font-data text-sm font-semibold ${p.up ? "text-bull" : "text-bear"}`} dir="ltr">
          ${formatPrice(p.price)}
        </span>
      )}
      {p.stale && <span className="rounded border border-gold/40 px-1.5 text-[11px] text-gold">{t("charts.stale")}</span>}
      {p.children}
    </div>
  );
}
