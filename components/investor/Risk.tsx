"use client";
import { useEffect, useMemo, useState } from "react";
import type { HoldingRow } from "@/lib/investor/calc";
import { PRESET_SHOCKS, applyShock, maxDrawdownPct, worstHistoricalScenario } from "@/lib/investor/risk";
import { getKlines } from "@/lib/binance";
import { useLanguage } from "@/lib/i18n";
import { fill, parseNum, signedPct, signedUsd, tone, usd } from "./fmt";

/** Hypothetical estimates only. Never a prediction, never a guarantee. */
export default function Risk({ holdings }: { holdings: HoldingRow[] }) {
  const { t } = useLanguage();
  const priced = holdings.filter((h) => h.value !== null && h.value > 0);
  const assetKey = priced.map((h) => h.asset).join(",");
  const [custom, setCustom] = useState("");
  const [dd, setDd] = useState<{ loading: boolean; byAsset: Record<string, number>; missing: string[] }>({ loading: true, byAsset: {}, missing: [] });

  useEffect(() => {
    let alive = true;
    const assets = assetKey ? assetKey.split(",") : [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDd({ loading: true, byAsset: {}, missing: [] });
    Promise.all(assets.map(async (a) => {
      try {
        const k = await getKlines(`${a}USDT`, "1d", 1000);
        return k.length > 30 ? ([a, maxDrawdownPct(k.map((x) => x.close))] as const) : ([a, null] as const);
      } catch { return [a, null] as const; }
    })).then((res) => {
      if (!alive) return;
      const byAsset: Record<string, number> = {};
      const missing: string[] = [];
      for (const [a, v] of res) { if (v === null) missing.push(a); else byAsset[a] = v; }
      setDd({ loading: false, byAsset, missing });
    });
    return () => { alive = false; };
  }, [assetKey]);

  const scenarios = useMemo(() => {
    const c = parseNum(custom);
    const list: number[] = [...PRESET_SHOCKS];
    if (Number.isFinite(c) && c >= -100 && c <= 1000 && !list.includes(c)) list.push(c);
    return list.map((p) => applyShock(priced, p));
  }, [priced, custom]);
  const worst = useMemo(() => worstHistoricalScenario(priced, dd.byAsset), [priced, dd.byAsset]);

  return (
    <div className="space-y-6">
      <p role="note" className="card p-4 text-sm text-gold border-gold">{t("investor.riskDisclaimer")}</p>
      {priced.length === 0 ? <p className="card p-6 text-sm text-text-muted">{t("investor.riskNoValue")}</p> : (
        <>
          <section className="card p-0 overflow-x-auto">
            <div className="p-4 flex flex-wrap items-end gap-3">
              <h2 className="text-label text-text-muted flex-1">{t("investor.presets")}</h2>
              <label className="text-xs text-text-muted">{t("investor.customShock")}<input dir="ltr" inputMode="decimal" className="input mt-1 block" style={{ width: "7rem" }} value={custom} onChange={(e) => setCustom(e.target.value)} /></label>
            </div>
            <table className="w-full text-sm min-w-[520px]">
              <thead><tr className="text-label text-text-muted">{["scenario", "before", "after", "change"].map((k) => <th key={k} className="px-4 py-2 font-normal text-start">{t(`investor.${k}`)}</th>)}</tr></thead>
              <tbody>
                {scenarios.map((o) => (
                  <tr key={o.shockPct} className="border-t border-line">
                    <td dir="ltr" className={`px-4 py-2.5 font-data text-start ${tone(o.shockPct)}`}>{signedPct(o.shockPct)}</td>
                    <td dir="ltr" className="px-4 py-2.5 font-data text-start">{usd(o.before)}</td>
                    <td dir="ltr" className="px-4 py-2.5 font-data text-start">{usd(o.after)}</td>
                    <td dir="ltr" className={`px-4 py-2.5 font-data text-start ${tone(o.change)}`}>{signedUsd(o.change)} ({signedPct(o.changePct)})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card p-4 space-y-3">
            <h2 className="text-label text-text-muted">{t("investor.worstTitle")}</h2>
            <p className="text-xs text-text-muted">{t("investor.worstBody")}</p>
            {dd.loading ? <p className="text-sm text-text-muted">{t("investor.worstLoading")}</p> : (
              <>
                <ul className="divide-y divide-line text-sm">
                  {worst.perAsset.map((r) => (
                    <li key={r.asset} className="flex flex-wrap items-center gap-x-4 py-2">
                      <span className="font-data w-16">{r.asset}</span>
                      <span className="text-text-muted text-xs">{t("investor.drawdown")}</span>
                      <span dir="ltr" className="font-data text-bear">{dd.missing.includes(r.asset) ? "—" : `-${r.drawdownPct.toFixed(1)}%`}</span>
                      <span className="flex-1" />
                      <span className="text-text-muted text-xs">{t("investor.estLoss")}</span>
                      <span dir="ltr" className="font-data text-bear">{dd.missing.includes(r.asset) ? "—" : `-${usd(r.loss)}`}</span>
                    </li>
                  ))}
                </ul>
                {dd.missing.length < worst.perAsset.length && <div className="flex flex-wrap gap-x-4 text-sm font-semibold">
                  <span>{t("investor.totalEstLoss")}</span>
                  <span dir="ltr" className="font-data text-bear">-{usd(worst.totalLoss)} ({signedPct(-worst.totalLossPct)})</span>
                  <span className="flex-1" />
                  <span dir="ltr" className="font-data">{usd(worst.before)} → {usd(worst.after)}</span>
                </div>}
                {dd.missing.length > 0 && <p className="text-xs text-gold">{fill(t("investor.worstMissing"), { list: dd.missing.join(", ") })}</p>}
              </>
            )}
            <p className="text-xs text-text-muted">{t("investor.riskDisclaimer")}</p>
          </section>
        </>
      )}
    </div>
  );
}
