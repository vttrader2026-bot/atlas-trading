"use client";

// BINANCE-HANDOFF-v1
// "Open in Binance": a plain link to the Binance Spot page of a pair. Atlas never places, changes or cancels orders.
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { getSpotTradingSymbols } from "@/lib/binance";
import { resolveBinanceSpot } from "@/lib/binanceLink";

export default function BinanceSpotLink({
  pair,
  className = "btn-secondary",
  showNotice = false,
  hideWhenUnavailable = false,
  children,
  wrapperClassName,
}: {
  pair: string;
  className?: string;
  /** Adds the short "execute manually on Binance" notice under the link. */
  showNotice?: boolean;
  /** Renders nothing (instead of a disabled button with a reason) when the pair cannot be linked. */
  hideWhenUnavailable?: boolean;
  /** Custom content for the link (default: "Open in Binance ↗"). */
  children?: React.ReactNode;
  wrapperClassName?: string;
}) {
  const { t, lang } = useLanguage();
  const [symbols, setSymbols] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    let alive = true;
    getSpotTradingSymbols()
      .then((s) => {
        if (alive) setSymbols(s);
      })
      .catch(() => {
        /* list unavailable: the link is still offered, unverified */
      });
    return () => {
      alive = false;
    };
  }, []);

  const r = resolveBinanceSpot(pair, lang, symbols);
  if (!r.ok) {
    if (hideWhenUnavailable) return null;
    return (
      <div className={wrapperClassName}>
        <span aria-disabled="true" className={`${className} opacity-50 cursor-not-allowed`}>{children ?? t("tradePlan.openBinance")}</span>
        <p className="mt-1.5 text-xs text-text-muted">{t(r.reason === "invalid" ? "tradePlan.binanceInvalid" : "tradePlan.binanceUnsupported")}</p>
      </div>
    );
  }
  return (
    <div className={wrapperClassName}>
      <a href={r.url} target="_blank" rel="noopener noreferrer" className={className}>
        {children ?? (<>{t("tradePlan.openBinance")} <span aria-hidden="true">↗</span></>)}
      </a>
      {showNotice && <p className="mt-1.5 text-xs text-text-muted leading-relaxed">{t("tradePlan.binanceNotice")}</p>}
    </div>
  );
}
