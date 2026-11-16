"use client";

// INVEST-SIGNAL-v1: owner-only "Share to Trade Feed" review dialog. It opens with a public-safe suggestion (coin, schedule
// shape, dip percentages: see planToInvestmentDraft) and publishes ONLY the text shown here to POST /api/admin/investment-signals.
// It never reads or changes the Investor plan, budget, purchases or portfolio. The server re-checks the owner.
import { useState } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { adminApi } from "@/components/admin/adminApi";
import { INVESTOR_ASSETS } from "@/lib/investor/assets";
import type { InvestmentSignal } from "@/lib/investmentSignal";
import { useLanguage } from "@/lib/i18n";

export default function ShareInvestmentDialog({ initial, onClose, onDone }: {
  initial?: { asset?: string; strategy?: string; horizonMonths?: number };
  onClose: () => void;
  onDone: (signal: InvestmentSignal) => void;
}) {
  const { t } = useLanguage();
  const [f, setF] = useState({ asset: initial?.asset ?? "", thesis: "", horizon: String(initial?.horizonMonths ?? 12), strategy: initial?.strategy ?? "", zone: "", risks: "", notes: "", tier: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const id = (k: string) => `inv-share-${k}`;
  const lab = "text-xs text-text-muted";
  const submit = async (): Promise<string | null> => {
    if (!f.tier) return t("investSignal.fAudience");
    const r = await adminApi<{ signal?: InvestmentSignal }>("/api/admin/investment-signals", "POST", {
      confirm: true, tier: f.tier, asset: f.asset, thesis: f.thesis, horizonMonths: Number(f.horizon), strategy: f.strategy, zone: f.zone, risks: f.risks, notes: f.notes,
    });
    if (!r.ok) return r.error || t("investSignal.errGeneric");
    if (r.data.signal) onDone(r.data.signal);
    return null;
  };
  return (
    <ConfirmDialog title={t("investSignal.shareTitle")} confirmLabel={t("investSignal.publish")} onClose={onClose} onConfirm={submit}>
      <p>{t("investSignal.shareIntro")}</p>
      {initial?.strategy !== undefined && <p>{t("investSignal.shareNote")}</p>}
      <div>
        <label htmlFor={id("asset")} className={lab}>{t("investSignal.fCoin")}</label>
        <select id={id("asset")} value={f.asset} onChange={set("asset")} disabled={!!initial?.asset} className="input mt-1 w-full">
          <option value="" />
          {INVESTOR_ASSETS.map((a) => <option key={a.ticker} value={a.ticker}>{a.ticker} · {a.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={id("thesis")} className={lab}>{t("investSignal.fThesis")}</label>
        <textarea id={id("thesis")} rows={4} maxLength={1500} value={f.thesis} onChange={set("thesis")} className="input mt-1 w-full" />
      </div>
      <div>
        <label htmlFor={id("horizon")} className={lab}>{t("investSignal.fHorizon")}</label>
        <input id={id("horizon")} dir="ltr" inputMode="numeric" value={f.horizon} onChange={set("horizon")} className="input mt-1 w-full font-data" />
      </div>
      <div>
        <label htmlFor={id("strategy")} className={lab}>{t("investSignal.fStrategy")}</label>
        <textarea id={id("strategy")} rows={3} maxLength={600} value={f.strategy} onChange={set("strategy")} className="input mt-1 w-full" />
      </div>
      <div>
        <label htmlFor={id("zone")} className={lab}>{t("investSignal.fZone")}</label>
        <input id={id("zone")} maxLength={200} value={f.zone} onChange={set("zone")} dir="ltr" className="input mt-1 w-full font-data" />
      </div>
      <div>
        <label htmlFor={id("risks")} className={lab}>{t("investSignal.fRisks")}</label>
        <textarea id={id("risks")} rows={3} maxLength={800} value={f.risks} onChange={set("risks")} className="input mt-1 w-full" />
      </div>
      <div>
        <label htmlFor={id("notes")} className={lab}>{t("investSignal.fNotes")}</label>
        <textarea id={id("notes")} rows={2} maxLength={800} value={f.notes} onChange={set("notes")} className="input mt-1 w-full" />
      </div>
      <div>
        <label htmlFor={id("tier")} className={lab}>{t("investSignal.fAudience")}</label>
        <select id={id("tier")} value={f.tier} onChange={set("tier")} className="input mt-1 w-full">
          <option value="" />
          <option value="free">{t("investSignal.audFree")}</option>
          <option value="elite">{t("investSignal.audElite")}</option>
        </select>
      </div>
    </ConfirmDialog>
  );
}
