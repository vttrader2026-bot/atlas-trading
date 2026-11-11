"use client";
import { useState } from "react";
import type { Summary } from "@/lib/investor/calc";
import type { InvestorDoc } from "@/lib/investor/model";
import { assetOf } from "@/lib/investor/assets";
import { CoinLogo } from "@/components/market/MarketBits";
import { useLanguage } from "@/lib/i18n";
import PriceBadge from "./PriceBadge";
import { fill, parseNum, pct, qty, signedPct, tone } from "./fmt";
import { useMoney, UsdtNote } from "./currency";

type Run = (m: (d: InvestorDoc) => InvestorDoc) => Promise<boolean>;
const COLORS = ["#f5b942", "#4fa3ff", "#34d399", "#f472b6", "#a78bfa", "#fb923c", "#22d3ee", "#facc15", "#94a3b8", "#f87171", "#2dd4bf", "#c084fc", "#60a5fa", "#a3e635", "#fda4af", "#fcd34d", "#7dd3fc"];

function Stat({ label, value, hint, cls = "" }: { label: string; value: string; hint?: string; cls?: string }) {
  return (
    <div className="card p-4" title={hint}>
      <div className="text-label text-text-muted">{label}</div>
      <div dir="ltr" className={`mt-1 text-xl sm:text-2xl font-data font-semibold ${cls}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-text-muted leading-snug">{hint}</div>}
    </div>
  );
}

function ManualPriceRow({ asset, current, run }: { asset: string; current?: { price: number; at: string }; run: Run }) {
  const { t } = useLanguage();
  const [v, setV] = useState(current ? String(current.price) : "");
  const [err, setErr] = useState(false);
  const save = async () => {
    const n = parseNum(v);
    if (!(n > 0)) return setErr(true);
    setErr(false);
    await run((d) => ({ ...d, manualPrices: { ...d.manualPrices, [asset]: { price: n, at: new Date().toISOString() } } }));
  };
  const remove = () => run((d) => { const m = { ...d.manualPrices }; delete m[asset]; return { ...d, manualPrices: m }; });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-2 w-32"><CoinLogo base={asset} size={22} /><span className="font-data text-sm">{asset}</span></span>
      <input dir="ltr" inputMode="decimal" aria-label={`${t("investor.setPrice")} ${asset}`} aria-invalid={err} className="input" style={{ width: "9rem" }} placeholder={t("investor.setPrice")} value={v} onChange={(e) => setV(e.target.value)} />
      <button type="button" className="btn-secondary" onClick={save}>{current ? t("investor.updatePrice") : t("investor.save")}</button>
      {current && <button type="button" className="text-xs text-text-muted underline" onClick={remove}>{t("investor.manualRemove")}</button>}
    </div>
  );
}

export default function Dashboard({ s, doc, run, onSell }: { s: Summary; doc: InvestorDoc; run: Run; onSell: (asset: string, price: number | null) => void }) {
  const { t } = useLanguage();
  const { usd, signedUsd, price } = useMoney();
  const needManual = s.holdings.filter((h) => h.price === null || h.price.source === "manual").map((h) => h.asset);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label={t("investor.invested")} value={usd(s.invested)} hint={t("investor.investedHint")} />
        <Stat label={t("investor.value")} value={usd(s.value)} hint={t("investor.valueHint")} />
        <Stat label={t("investor.unrealized")} value={signedUsd(s.unrealized)} cls={tone(s.unrealized)} hint={t("investor.unrealizedHint")} />
        <Stat label={t("investor.roi")} value={signedPct(s.roiPct)} cls={tone(s.roiPct)} hint={t("investor.roiHint")} />
        <Stat label={t("investor.realized")} value={signedUsd(s.realized)} cls={tone(s.realized)} hint={t("investor.realizedHint")} />
        <Stat label={t("investor.cash")} value={usd(s.cash)} cls={s.cash < 0 ? "text-bear" : ""} hint={t("investor.cashHint")} />
      </div>

      {s.cash < 0 && <p role="alert" className="text-sm text-bear">{t("investor.cashNegative")}</p>}
      {s.missingPrices.length > 0 && <p role="status" className="text-sm text-gold">{fill(t("investor.incomplete"), { list: s.missingPrices.join(", ") })}</p>}
      {s.usesManualPrices && <p className="text-xs text-text-muted">✎ {t("investor.manualInUse")}</p>}

      {s.holdings.length === 0 ? (
        <p className="card p-6 text-sm text-text-muted">{t("investor.noHoldings")}</p>
      ) : (
        <>
          <section className="card p-4" aria-label={t("investor.allocation")}>
            <h2 className="text-label text-text-muted">{t("investor.allocation")}</h2>
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-surface-raised" dir="ltr" role="img" aria-label={s.holdings.filter((h) => h.allocationPct !== null).map((h) => `${h.asset} ${pct(h.allocationPct)}`).join(", ")}>
              {s.holdings.map((h, i) => h.allocationPct ? <span key={h.asset} style={{ width: `${h.allocationPct}%`, background: COLORS[i % COLORS.length] }} /> : null)}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
              {s.holdings.map((h, i) => (
                <li key={h.asset} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="font-data">{h.asset}</span><span dir="ltr" className="text-text-muted">{pct(h.allocationPct)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-0 overflow-x-auto" aria-label={t("investor.holdings")}>
            <table className="w-full text-sm min-w-[840px]">
              <thead>
                <tr className="text-label text-text-muted text-start">
                  {["colAsset", "colQty", "colAvg", "colPrice", "colValue", "colPnl", "colRoi", "colRealized", "colShare"].map((k) => <th key={k} className="px-3 py-2.5 font-normal text-start">{t(`investor.${k}`)}</th>)}
                  <th className="sticky end-0 bg-surface border-s border-line px-3 py-2.5"><span className="sr-only">{t("investor.sellBtn")}</span></th>
                </tr>
              </thead>
              <tbody>
                {s.holdings.map((h) => (
                  <tr key={h.asset} className="border-t border-line">
                    <td className="px-3 py-2.5"><span className="flex items-center gap-2"><CoinLogo base={h.asset} size={24} /><span>{h.name}</span><span dir="ltr" className="font-data text-xs text-text-muted">{h.asset}</span></span></td>
                    <td dir="ltr" className="px-3 py-2.5 font-data text-start">{qty(h.qty)}</td>
                    <td dir="ltr" className="px-3 py-2.5 font-data text-start" title={`${t("investor.colAvgNoFee")}: ${price(h.avgPriceExFees)}`}>{price(h.avgPrice)}</td>
                    <td className="px-3 py-2.5 text-start"><PriceBadge info={h.price} /></td>
                    <td dir="ltr" className="px-3 py-2.5 font-data text-start">{h.value === null ? "—" : usd(h.value)}</td>
                    <td dir="ltr" className={`px-3 py-2.5 font-data text-start ${tone(h.unrealized)}`}>{h.unrealized === null ? "—" : signedUsd(h.unrealized)}</td>
                    <td dir="ltr" className={`px-3 py-2.5 font-data text-start ${tone(h.roiPct)}`}>{signedPct(h.roiPct)}</td>
                    <td dir="ltr" className={`px-3 py-2.5 font-data text-start ${tone(h.realizedPnl)}`}>{signedUsd(h.realizedPnl)}</td>
                    <td dir="ltr" className="px-3 py-2.5 font-data text-start">{pct(h.allocationPct)}</td>
                    <td className="sticky end-0 bg-surface border-s border-line px-3 py-2.5 text-end"><button type="button" className="btn-secondary !px-4 !py-1.5 text-sm" aria-label={`${t("investor.sellBtn")} ${h.asset}`} onClick={() => onSell(h.asset, h.price?.price ?? null)}>{t("investor.sellBtn")}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {needManual.length > 0 && (
        <section className="card p-4 space-y-3">
          <h2 className="text-label text-text-muted">{t("investor.manualTitle")}</h2>
          <p className="text-xs text-text-muted">{t("investor.manualBody")}</p>
          <UsdtNote />
          {needManual.map((a) => <ManualPriceRow key={a + (doc.manualPrices[a]?.at ?? "")} asset={a} current={doc.manualPrices[a]} run={run} />)}
        </section>
      )}

      {s.closed.length > 0 && (
        <section className="card p-4">
          <h2 className="text-label text-text-muted">{t("investor.closedPositions")}</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {s.closed.map((c) => (
              <li key={c.asset} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2"><CoinLogo base={c.asset} size={22} />{assetOf(c.asset)?.name} <span dir="ltr" className="font-data text-xs text-text-muted">{c.asset}</span></span>
                <span dir="ltr" className={`font-data ${tone(c.realizedPnl)}`}>{signedUsd(c.realizedPnl)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
