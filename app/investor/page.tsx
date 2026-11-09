"use client";
// ATLAS INVESTOR V1. Private (see lib/privateRoutes.ts). Manual records only: no exchange connection, no orders.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { useLiveTickers } from "@/lib/useLiveTickers";
import { resolvePrices, summarize } from "@/lib/investor/calc";
import type { InvestorDoc } from "@/lib/investor/model";
import { isSupportedTicker } from "@/lib/investor/assets";
import { useInvestor, type CommitResult } from "@/components/investor/useInvestor";
import { fill } from "@/components/investor/fmt";
import Dashboard from "@/components/investor/Dashboard";
import TradeForm from "@/components/investor/TradeForm";
import Ledger, { type PurchaseDraft } from "@/components/investor/Ledger";
import Dca from "@/components/investor/Dca";
import Risk from "@/components/investor/Risk";
import Performance from "@/components/investor/Performance";

const TABS = ["Dashboard", "Ledger", "Dca", "Risk", "Performance"] as const;
type Tab = (typeof TABS)[number];

export default function InvestorPage() {
  const { t } = useLanguage();
  const { doc, state, saving, commit } = useInvestor();
  const live = useLiveTickers();
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [sell, setSell] = useState<{ asset: string; price: number | null } | null>(null);

  // /investor?asset=BTC (from Smart Actions): open the usual purchase form with the coin filled in. Only the 17 supported coins; nothing is saved until Save.
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("asset")?.trim().toUpperCase();
    if (!a) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (!isSupportedTicker(a)) return;
    // Opening the purchase form from an external link is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft({ asset: a });
    setTab("Ledger");
  }, []);

  const prices = useMemo(() => resolvePrices(live, doc.manualPrices), [live, doc.manualPrices]);
  const summary = useMemo(() => summarize(doc, prices), [doc, prices]);

  const message = useCallback((r: Extract<CommitResult, { ok: false }>) =>
    r.error === "oversell" ? fill(t("investor.oversell"), { held: r.detail?.held ?? 0, asset: r.detail?.asset ?? "" }) : t(`investor.${r.error === "save" ? "saveError" : r.error}`), [t]);

  const run = useCallback(async (m: (d: InvestorDoc) => InvestorDoc) => {
    const r = await commit(m);
    setNotice(r.ok ? null : message(r));
    return r.ok;
  }, [commit, message]);

  if (state === "loading") return <main className="max-w-5xl mx-auto px-6 py-12"><p className="text-text-muted">{t("investor.loading")}</p></main>;
  if (state === "unauth") return <main className="max-w-5xl mx-auto px-6 py-12"><p>{t("investor.signIn")}</p></main>;
  if (state === "error") return <main className="max-w-5xl mx-auto px-6 py-12"><p role="alert" className="text-bear">{t("investor.loadError")}</p></main>;

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 sm:py-14">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("investor.title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-2xl">{t("investor.subtitle")}</p>
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-text-muted border-s-2 border-gold ps-3">{t("investor.disclaimer")}</p>

      <div role="tablist" aria-label={t("investor.title")} className="mt-8 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} id={`inv-tab-${k}`} aria-controls="inv-panel" type="button" onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === k ? "border-gold text-gold font-semibold" : "border-transparent text-text-muted hover:text-text"}`}>
            {t(`investor.tab${k}`)}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="min-h-6 mt-3 text-sm">
        {saving && <span className="text-text-muted">{t("investor.saving")}</span>}
        {!saving && notice && <span role="alert" className="text-bear">{notice}</span>}
      </div>

      <div id="inv-panel" role="tabpanel" aria-labelledby={`inv-tab-${tab}`} className="mt-3">
        {tab === "Dashboard" && <Dashboard s={summary} doc={doc} run={run} onSell={(asset, price) => setSell({ asset, price })} />}
        {tab === "Ledger" && <Ledger doc={doc} run={run} draft={draft} clearDraft={() => setDraft(null)} livePrice={(a) => prices[a]?.price ?? null} />}
        {tab === "Dca" && <Dca doc={doc} prices={prices} run={run} onRecord={(d) => { setDraft(d); setTab("Ledger"); }} />}
        {tab === "Risk" && <Risk holdings={summary.holdings} />}
        {tab === "Performance" && <Performance doc={doc} s={summary} />}
      </div>

      {sell && (
        <div role="dialog" aria-modal="true" aria-label={t("investor.addSale")} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSell(null); }}>
          <div className="w-full max-w-xl my-auto">
            <TradeForm init={{ kind: "sell", asset: sell.asset, price: sell.price ? String(sell.price) : "" }} doc={doc} run={run} onClose={() => setSell(null)} />
          </div>
        </div>
      )}
    </main>
  );
}
