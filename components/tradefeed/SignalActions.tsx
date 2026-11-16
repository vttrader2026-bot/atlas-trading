"use client";

// ATLAS-SIGNAL-ACTIONS-v1
// The connected actions on a Trade Feed signal: Create Trade Plan, Confirm Trade, Open in Binance.
// Nothing here changes the official signal. FREE and ELITE signals use the same Confirm Trade: the server checks
// a fresh market price against the entry zone and only then creates the Journal trade.

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import type { PublishedTrade } from "@/lib/tradeFeed";
import { isLiveSignal, isLongSignal } from "@/lib/signalLink";
import { ConfirmTradeDialog } from "@/components/tradefeed/ConfirmTradeDialog";
import BinanceSpotLink from "@/components/BinanceSpotLink";
import StarButton from "@/components/watchlist/StarButton";

const pill = "inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap";
const pillIdle = "border-line text-text-muted hover:text-text hover:border-text-muted";

export function SignalActions({
  signal, journalTradeId, hasPlan, onTook, confirmable = false,
}: {
  signal: PublishedTrade;
  /** Journal trade already linked to this signal, if any. */
  journalTradeId: string | null;
  /** The current Trade Plan draft is linked to this signal. */
  hasPlan: boolean;
  onTook: () => void;
  /** May this viewer press Confirm Trade? Any signed-in member for FREE signals; active ELITE members for ELITE signals. */
  confirmable?: boolean;
}) {
  const { t } = useLanguage();
  const [confirmDialog, setConfirmDialog] = useState(false);
  const long = isLongSignal(signal);
  const live = isLiveSignal(signal);
  const label = signal.tradeId || signal.id.slice(0, 8);

  return (
    <div className="mt-3 border-t border-line pt-3" role="group" aria-label={t("tradeFeed.actionsLabel")}>
      <div className="flex flex-wrap items-center gap-2">
        <StarButton symbol={signal.pair} />
        {long && (live || hasPlan) && (
          <Link href={`/trade-plan?signal=${encodeURIComponent(signal.id)}`} className={`${pill} ${pillIdle}`}>
            {hasPlan ? t("tradeFeed.actPlanOpen") : t("tradeFeed.actPlan")}
          </Link>
        )}
        {long && journalTradeId ? (
          <Link href={`/journal?trade=${encodeURIComponent(journalTradeId)}`} className={`${pill} border-bull/40 bg-bull/10 text-bull`}>
            ✓ {t("tradeFeed.actInJournal")}
          </Link>
        ) : (
          long && live && confirmable && (
            <button type="button" onClick={() => setConfirmDialog(true)} className={`${pill} border-gold/50 bg-gold/10 text-gold hover:bg-gold/20`}>
              {t("tradeFeed.actConfirm")}
            </button>
          )
        )}
        {long && live && <BinanceSpotLink pair={signal.pair} className={`${pill} ${pillIdle}`} hideWhenUnavailable />}
      </div>
      {!long && <p className="mt-2 text-xs text-text-muted">{t("tradeFeed.shortNote")}</p>}
      <p className="mt-2 text-[11px] text-text-muted">
        {t("tradeFeed.signalId")}: <span dir="ltr" className="font-data" style={{ unicodeBidi: "isolate" }} title={signal.id}>{label}</span>
      </p>

      {confirmDialog && <ConfirmTradeDialog signal={signal} onClose={() => setConfirmDialog(false)} onDone={onTook} />}
    </div>
  );
}
