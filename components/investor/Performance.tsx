"use client";
import { useEffect, useMemo, useState } from "react";
import type { InvestorDoc } from "@/lib/investor/model";
import { purchaseCost, saleProceeds } from "@/lib/investor/model";
import type { Summary } from "@/lib/investor/calc";
import { Closes, closesFrom, valueSeries, type SeriesPoint } from "@/lib/investor/performance";
import { getKlinesFrom } from "@/lib/binance";
import { CoinLogo } from "@/components/market/MarketBits";
import { useLanguage } from "@/lib/i18n";
import PriceBadge from "./PriceBadge";
import { fill, price, qty, signedPct, signedUsd, today, tone, usd } from "./fmt";

function LineChart({ points, label }: { points: SeriesPoint[]; label: string }) {
  const W = 640, H = 240, L = 8, R = 8, T = 12, B = 24;
  const max = Math.max(1, ...points.flatMap((p) => [p.value, p.cost]));
  const x = (i: number) => L + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (k: "value" | "cost") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={label}>
      {[0, 0.5, 1].map((g) => <line key={g} x1={L} x2={W - R} y1={y(max * g)} y2={y(max * g)} stroke="currentColor" strokeOpacity={0.12} />)}
      <path d={path("cost")} fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth={2} strokeDasharray="5 4" />
      <path d={path("value")} fill="none" stroke="var(--gold, #f5b942)" strokeWidth={2.5} />
      <text x={L} y={H - 6} fontSize={11} fill="currentColor" fillOpacity={0.65}>{points[0]?.date}</text>
      <text x={W - R} y={H - 6} fontSize={11} fill="currentColor" fillOpacity={0.65} textAnchor="end">{points[points.length - 1]?.date}</text>
      <text x={W - R} y={T + 10} fontSize={11} fill="currentColor" fillOpacity={0.65} textAnchor="end">{usd(max)}</text>
    </svg>
  );
}

async function fetchCloses(asset: string, startMs: number): Promise<Record<string, number> | null> {
  try {
    const out: Record<string, number> = {};
    let from = startMs;
    for (let page = 0; page < 4; page++) {
      const k = await getKlinesFrom(`${asset}USDT`, "1d", from, 1000);
      if (!k.length) break;
      Object.assign(out, closesFrom(k));
      const last = k[k.length - 1].openTime;
      if (k.length < 1000 || last >= Date.now() - 86_400_000) break;
      from = last + 86_400_000;
    }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

export default function Performance({ doc, s }: { doc: InvestorDoc; s: Summary }) {
  const { t } = useLanguage();
  const assets = useMemo(() => [...new Set(doc.purchases.map((p) => p.asset))].sort(), [doc.purchases]);
  const first = useMemo(() => [...doc.purchases.map((p) => p.date)].sort()[0], [doc.purchases]);
  const key = assets.join(",") + "|" + first;
  const [closes, setCloses] = useState<{ loading: boolean; data: Closes }>({ loading: true, data: {} });

  useEffect(() => {
    let alive = true;
    if (!first) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCloses({ loading: true, data: {} });
    const start = Date.parse(`${first}T00:00:00Z`);
    Promise.all(assets.map(async (a) => [a, await fetchCloses(a, start)] as const)).then((res) => {
      if (!alive) return;
      const data: Closes = {};
      for (const [a, c] of res) if (c) data[a] = c;
      setCloses({ loading: false, data });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const series = useMemo(() => valueSeries(doc, closes.data, today()), [doc, closes.data]);
  const history = useMemo(() => [
    ...doc.purchases.map((p) => ({ id: p.id, date: p.date, type: "typeBuy", label: p.asset, amount: -purchaseCost(p) })),
    ...doc.sales.map((x) => ({ id: x.id, date: x.date, type: "typeSell", label: x.asset, amount: saleProceeds(x) })),
    ...doc.cash.map((c) => ({ id: c.id, date: c.date, type: c.type === "deposit" ? "typeDeposit" : "typeWithdrawal", label: "USDT", amount: c.type === "deposit" ? c.amount : -c.amount })),
  ].sort((a, b) => b.date.localeCompare(a.date)), [doc]);

  if (doc.purchases.length === 0) return <p className="card p-6 text-sm text-text-muted">{t("investor.perfEmpty")}</p>;
  const all = [...s.holdings, ...s.closed.map((c) => ({ ...c, name: c.asset, price: null, value: null, unrealized: null, roiPct: null, allocationPct: null }))];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4"><div className="text-label text-text-muted">{t("investor.realizedTotal")}</div><div dir="ltr" className={`mt-1 text-xl font-data font-semibold ${tone(s.realized)}`}>{signedUsd(s.realized)}</div></div>
        <div className="card p-4"><div className="text-label text-text-muted">{t("investor.unrealizedTotal")}</div><div dir="ltr" className={`mt-1 text-xl font-data font-semibold ${tone(s.unrealized)}`}>{signedUsd(s.unrealized)}</div></div>
      </div>

      <section className="card p-4">
        <h2 className="text-label text-text-muted">{t("investor.perfValue")}</h2>
        {closes.loading ? <p className="mt-3 text-sm text-text-muted">{t("investor.perfLoading")}</p> : series.points.length > 1 ? (
          <>
            <div className="mt-3" dir="ltr"><LineChart points={series.points} label={t("investor.chartLabel")} /></div>
            <div className="mt-2 flex gap-5 text-xs text-text-muted">
              <span><span className="inline-block w-5 border-t-2 align-middle me-1" style={{ borderColor: "var(--gold, #f5b942)" }} />{t("investor.value")}</span>
              <span><span className="inline-block w-5 border-t-2 border-dashed align-middle me-1" />{t("investor.perfCost")}</span>
            </div>
          </>
        ) : <p className="mt-3 text-sm text-text-muted">{t("investor.perfEmpty")}</p>}
        {!closes.loading && series.approximate.length > 0 && <p className="mt-2 text-xs text-gold">{fill(t("investor.perfApprox"), { list: series.approximate.join(", ") })}</p>}
      </section>

      <section className="card p-0 overflow-x-auto">
        <h2 className="text-label text-text-muted p-4 pb-2">{t("investor.perAsset")}</h2>
        <table className="w-full text-sm min-w-[720px]">
          <thead><tr className="text-label text-text-muted">{["colAsset", "colQty", "avgPrice", "colPrice", "colValue", "colPnl", "colRoi", "colRealized"].map((k) => <th key={k} className="px-3 py-2 font-normal text-start">{t(`investor.${k}`)}</th>)}</tr></thead>
          <tbody>
            {all.map((h) => (
              <tr key={h.asset} className="border-t border-line">
                <td className="px-3 py-2.5"><span className="flex items-center gap-2"><CoinLogo base={h.asset} size={20} /><span dir="ltr" className="font-data">{h.asset}</span></span></td>
                <td dir="ltr" className="px-3 py-2.5 font-data text-start">{qty(h.qty)}</td>
                <td dir="ltr" className="px-3 py-2.5 font-data text-start">{h.qty > 0 ? price(h.avgPrice) : "—"}</td>
                <td className="px-3 py-2.5 text-start">{h.qty > 0 ? <PriceBadge info={h.price} /> : "—"}</td>
                <td dir="ltr" className="px-3 py-2.5 font-data text-start">{h.value === null ? "—" : usd(h.value)}</td>
                <td dir="ltr" className={`px-3 py-2.5 font-data text-start ${tone(h.unrealized)}`}>{h.unrealized === null ? "—" : signedUsd(h.unrealized)}</td>
                <td dir="ltr" className={`px-3 py-2.5 font-data text-start ${tone(h.roiPct)}`}>{signedPct(h.roiPct)}</td>
                <td dir="ltr" className={`px-3 py-2.5 font-data text-start ${tone(h.realizedPnl)}`}>{signedUsd(h.realizedPnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <h2 className="text-label text-text-muted">{t("investor.history")}</h2>
        <ul className="mt-1 divide-y divide-line text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex items-center gap-4 py-2">
              <span dir="ltr" className="font-data text-xs text-text-muted w-24">{h.date}</span>
              <span className="w-24">{t(`investor.${h.type}`)}</span>
              <span dir="ltr" className="font-data w-16">{h.label}</span>
              <span className="flex-1" />
              <span dir="ltr" className={`font-data ${h.amount >= 0 ? "text-bull" : "text-bear"}`}>{signedUsd(h.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
