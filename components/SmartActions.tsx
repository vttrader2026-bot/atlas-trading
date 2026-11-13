"use client";

// SMART ACTIONS: one reusable "what next?" block for a coin, used inside the shared chart panel that
// both Radar and Market Pulse open. It only links to existing pages (coin prefilled where the
// page supports it) and reuses the Watchlist star. It never saves anything and never assumes a trade.

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { useWatchlist } from "@/lib/useWatchlist";
import { normalizeSymbol } from "@/lib/watchlist";
import { smartActions, smartBase, type SmartActionKey } from "@/lib/smartActions";
import StarButton from "@/components/watchlist/StarButton";

const ICON: Record<SmartActionKey, React.ReactNode> = {
  analyze: <path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" />,
  plan: <path d="M9 5h10M9 12h10M9 19h10M4.5 5l1 1 2-2M4.5 12l1 1 2-2M4.5 19l1 1 2-2" />,
  bought: <path d="M5 4h11l3 3v13H5zM9 11h6M9 15h6" />,
  invest: <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />,
};

export default function SmartActions({ base, analyzed = false }: { base: string; analyzed?: boolean }) {
  const { t } = useLanguage();
  const wl = useWatchlist();
  const coin = smartBase(base);
  const actions = smartActions(base);
  if (!coin) return null;
  const sym = normalizeSymbol(coin);
  const onList = !!sym && wl.has(sym);
  const name = `⁨${coin}⁩`; // keeps the Latin ticker intact inside Arabic text
  const fillCoin = (s: string) => s.replace("{coin}", name);

  return (
    <section aria-label={fillCoin(t("chart.smart.title"))} data-smart-actions className="mt-4 rounded-xl border border-line p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold">{fillCoin(t("chart.smart.title"))}</h3>
        <span className="inline-flex items-center gap-1 text-xs text-text-muted" data-watch-status={onList ? "on" : "off"}>
          {onList ? t("chart.smart.onWatchlist") : t("chart.smart.offWatchlist")}
          <StarButton symbol={coin} />
        </span>
      </div>
      {analyzed && (
        <p role="status" className="mt-2 text-xs text-gold" data-smart-after-analysis>{t("chart.smart.afterAnalysis")}</p>
      )}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {actions.map((a) => {
          const hot = analyzed && a.key === "plan";
          return (
            <Link
              key={a.key}
              href={a.href}
              data-smart={a.key}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                hot ? "border-gold bg-gold/10" : "border-line hover:border-gold/60 hover:bg-gold/5"
              }`}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-gold">
                {ICON[a.key]}
              </svg>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(`chart.smart.${a.key}`)}</span>
                <span className="block text-xs text-text-muted leading-snug">{fillCoin(t(`chart.smart.${a.key}Hint`))}</span>
              </span>
            </Link>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-text-muted">{t("chart.smart.note")}</p>
    </section>
  );
}
