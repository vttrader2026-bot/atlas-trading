"use client";
import type { PriceInfo } from "@/lib/investor/calc";
import { useLanguage } from "@/lib/i18n";
import { fill } from "./fmt";
import { useMoney } from "./currency";

/**
 * A price with a small badge saying where it came from.
 *  - Live: subtle green "Live" pill. "Binance" is the tooltip.
 *  - Manual: gold dashed "Manual" pill, so a typed-in price is never mistaken for a live one. The date is the tooltip.
 * The price comes first and stays plain; the badge sits beside it and wraps below on narrow columns.
 */
export default function PriceBadge({ info }: { info: PriceInfo | null }) {
  const { t } = useLanguage();
  const { price } = useMoney();
  if (!info) return <span className="text-text-muted text-xs">{t("investor.noPrice")}</span>;
  const live = info.source === "binance";
  const tip = live ? t("investor.live") : fill(t("investor.manualSince"), { date: (info.at ?? "").slice(0, 10) });
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span dir="ltr" className="font-data">{price(info.price)}</span>
      <span
        title={tip}
        aria-label={tip}
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium leading-4 ${live ? "text-bull" : "text-gold border border-dashed border-gold"}`}
        style={{ background: `color-mix(in srgb, var(${live ? "--bull" : "--gold"}) 13%, transparent)` }}
      >
        {live ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-bull" /> : <span aria-hidden="true">✎</span>}
        {live ? t("investor.liveShort") : t("investor.manual")}
      </span>
    </span>
  );
}
