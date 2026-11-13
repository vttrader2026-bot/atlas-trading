"use client";
// DASHBOARD-INVESTOR-v1: read-only Atlas Investor overview for the main Dashboard. Real data only: the signed-in user's own
// investor document (/api/me/investor, server-enforced) run through the SAME summarize() as the Investor page. It is kept
// visually and logically apart from the trading journal and its performance statistics. No number here is ever estimated.
import { useMemo } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { useLiveTickers } from "@/lib/useLiveTickers";
import { resolvePrices, summarize } from "@/lib/investor/calc";
import { useInvestor } from "@/components/investor/useInvestor";
import { CurrencyProvider, useMoney } from "@/components/investor/currency";
import { COLORS, Stat } from "@/components/investor/Dashboard";
import { fill, signedPct, tone } from "@/components/investor/fmt";

function Body() {
  const { t } = useLanguage();
  const { doc, state } = useInvestor();
  const live = useLiveTickers();
  const { usd, signedUsd } = useMoney();
  const s = useMemo(() => summarize(doc, resolvePrices(live, doc.manualPrices)), [doc, live]);

  if (state === "loading" || state === "unauth") return null; // private data: nothing is shown without a session
  const rows = s.holdings.filter((h) => h.allocationPct !== null);
  const empty = doc.purchases.length === 0 && doc.sales.length === 0;

  return (
    <section className="mt-8 card p-4 sm:p-5" aria-labelledby="dash-investor-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="dash-investor-title" className="font-heading text-lg font-bold">{t("investor.overviewTitle")}</h2>
          <p className="mt-0.5 text-xs text-text-muted">{t("investor.overviewNote")}</p>
        </div>
        <Link href="/investor" className="btn-secondary">{t("investor.overviewOpen")}</Link>
      </div>

      {state === "error" && <p role="alert" className="mt-3 text-sm text-bear">{t("investor.loadError")}</p>}
      {state === "ready" && empty && <p className="mt-3 text-sm text-text-muted">{t("investor.overviewEmpty")}</p>}
      {state === "ready" && !empty && (
        <>
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label={t("investor.invested")} value={usd(s.invested)} />
            <Stat label={t("investor.value")} value={usd(s.value)} />
            <Stat label={t("investor.unrealized")} value={signedUsd(s.unrealized)} cls={tone(s.unrealized)} />
            <Stat label={t("investor.roi")} value={signedPct(s.roiPct)} cls={tone(s.roiPct)} />
          </div>
          {s.missingPrices.length > 0 && <p role="status" className="mt-3 text-sm text-gold">{fill(t("investor.incomplete"), { list: s.missingPrices.join(", ") })}</p>}
          {rows.length > 0 && (
            <div className="mt-4">
              <h3 className="text-label text-text-muted">{t("investor.allocation")}</h3>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-line" dir="ltr" role="img" aria-label={rows.map((r) => `${r.asset} ${(r.allocationPct as number).toFixed(1)}%`).join(", ")}>
                {rows.map((r, i) => <div key={r.asset} style={{ width: `${r.allocationPct}%`, background: COLORS[i % COLORS.length] }} />)}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" dir="ltr">
                {rows.slice(0, 8).map((r, i) => (
                  <li key={r.asset} className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /><span className="font-data">{r.asset} {(r.allocationPct as number).toFixed(1)}%</span></li>
                ))}
                {rows.length > 8 && <li className="text-text-muted">+{rows.length - 8}</li>}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function InvestorOverview() {
  return <CurrencyProvider><Body /></CurrencyProvider>;
}
