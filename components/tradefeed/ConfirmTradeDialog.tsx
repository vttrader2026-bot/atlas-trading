"use client";

// ELITE-CONFIRM-v1
// Confirm Trade for an ELITE signal. The member types the price they actually got and the amount they
// invested. The SERVER then fetches a fresh market price and only accepts the confirmation while that
// price is inside the official entry zone (see app/api/me/confirm-trade/route.ts). Nothing is added to
// the Journal here unless the server says yes.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import type { PublishedTrade } from "@/lib/tradeFeed";
import { parseInput } from "@/lib/riskCalc";
import { outcomeText, postConfirm } from "@/lib/eliteConfirmClient";

export function ConfirmTradeDialog({ signal, onClose, onDone }: { signal: PublishedTrade; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [entry, setEntry] = useState("");
  const [invested, setInvested] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedText, setBlockedText] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBlockedText(null);
    const entryNum = parseInput(entry);
    const investedNum = parseInput(invested);
    if (entryNum === null) return setError(t("journal.errEntry"));
    if (investedNum === null) return setError(t("journal.errInvested"));
    setBusy(true);
    // The price check happens on the server, at this moment. No price is sent from here.
    const out = await postConfirm({ signalId: signal.id, entry: entryNum, invested: investedNum });
    setBusy(false);
    if (out.ok) {
      setSavedId(out.trade.id);
      onDone();
    } else setBlockedText(outcomeText(out, t));
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div>
      <label htmlFor={id} className="text-xs text-text-muted">{label}</label>
      <input id={id} value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" dir="ltr" className="input mt-1.5 w-full font-data" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("tradeFeed.cfTitle")} onClick={(e) => e.stopPropagation()}
        className="card w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6 rounded-b-none sm:rounded-b-[inherit]">
        {savedId ? (
          <div>
            <div className="font-semibold text-bull">✓ {t("tradeFeed.cfDone")}</div>
            <div className="mt-4 flex gap-3">
              <Link href={`/journal?trade=${encodeURIComponent(savedId)}`} className="btn-primary">{t("tradeFeed.tookView")}</Link>
              <button type="button" onClick={onClose} className="btn-secondary">{t("journal.close")}</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="text-label">{signal.pair}</div>
            <h2 className="mt-1 text-xl font-bold">{t("tradeFeed.cfTitle")}</h2>
            <p className="mt-1 text-sm text-text-muted">{t("tradeFeed.cfBody")}</p>
            <p className="mt-3 text-xs text-text-muted">
              {t("tradeFeed.tookZone")}: <span dir="ltr" className="font-data text-text" style={{ unicodeBidi: "isolate" }}>{signal.entryZone || "—"}</span>
            </p>
            <div className="mt-4 grid gap-4">
              {field("cf-entry", t("tradeFeed.tookEntry"), entry, setEntry)}
              {field("cf-inv", t("tradeFeed.tookInvested"), invested, setInvested)}
            </div>
            {blockedText && (
              <p className="mt-3 rounded-lg border border-bear/40 bg-bear/10 px-3 py-2 text-sm text-bear" role="alert">{blockedText}</p>
            )}
            {error && <p className="mt-3 text-sm text-bear" role="alert">{error}</p>}
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="submit" disabled={busy} className="btn-primary disabled:opacity-60">{busy ? t("tradeFeed.cfChecking") : t("tradeFeed.cfSubmit")}</button>
              <button type="button" onClick={onClose} className="btn-secondary">{t("journal.cancel")}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
