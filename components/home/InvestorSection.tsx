"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { IconOverview, IconJournal, IconWatchlist, IconRisk } from "@/components/icons";
import { fill } from "@/components/investor/fmt";

// Homepage feature card for Atlas Investor. The picture on the right is a decorative ILLUSTRATION (labelled as such):
// it shows no balances or prices, so nothing on it can be mistaken for real data.
const SEGMENTS = [
  { t: "BTC", w: 46, c: "#f5b942" },
  { t: "ETH", w: 27, c: "#4fa3ff" },
  { t: "SOL", w: 16, c: "#34d399" },
  { t: "XRP", w: 11, c: "#f472b6" },
];

export default function InvestorSection() {
  const { t } = useLanguage();
  const features = [
    { icon: <IconOverview className="w-5 h-5" />, title: t("investor.homeF1Title"), body: t("investor.homeF1Body") },
    { icon: <IconJournal className="w-5 h-5" />, title: t("investor.homeF2Title"), body: t("investor.homeF2Body") },
    { icon: <IconWatchlist className="w-5 h-5" />, title: t("investor.homeF3Title"), body: t("investor.homeF3Body") },
    { icon: <IconRisk className="w-5 h-5" />, title: t("investor.homeF4Title"), body: t("investor.homeF4Body") },
  ];
  return (
    <div className="grid lg:grid-cols-5 gap-4" data-home-investor>
      <div className="lg:col-span-3 card card-accent p-7 sm:p-9 flex flex-col home-rise">
        <p className="text-base sm:text-lg text-text-muted leading-relaxed max-w-xl">{t("investor.homeBody")}</p>
        <ul className="mt-7 grid sm:grid-cols-2 gap-3">
          {features.map((f) => (
            <li key={f.title} className="rounded-xl border border-line bg-bg/40 p-4 flex gap-3">
              <span className="w-9 h-9 shrink-0 rounded-lg border border-line flex items-center justify-center text-gold bg-gold/5">{f.icon}</span>
              <span className="min-w-0">
                <span className="block text-base font-semibold leading-snug">{f.title}</span>
                <span className="block mt-1 text-sm text-text-muted leading-snug">{f.body}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-8 flex flex-wrap items-center gap-4">
          <Link href="/investor" className="btn-primary inline-flex items-center gap-2">{t("investor.homeCta")} <span aria-hidden className="rtl:rotate-180">{"→"}</span></Link>
          <span className="text-sm text-text-muted max-w-sm">{t("investor.homeNote")}</span>
        </div>
      </div>

      <Link href="/investor" aria-label={t("investor.homeCta")} className="lg:col-span-2 home-tile home-rise group rounded-2xl border border-line bg-surface p-6 sm:p-7 flex flex-col gap-6" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center justify-between">
          <span className="font-heading text-lg font-bold">{t("investor.title")}</span>
          <span className="text-[10px] uppercase tracking-wide text-text-muted border border-line rounded-full px-2 py-0.5">{t("investor.homeIllustration")}</span>
        </div>
        <div aria-hidden>
          <div className="text-label text-text-muted">{t("investor.value")}</div>
          <div dir="ltr"><svg viewBox="0 0 320 120" className="mt-2 w-full h-auto text-text-muted">
            <path d="M0 96 H60 V84 H120 V78 H180 V66 H240 V62 H320" fill="none" stroke="currentColor" strokeOpacity={0.5} strokeWidth={2} strokeDasharray="5 4" />
            <path d="M0 96 C40 92 60 80 100 78 S150 90 190 62 S260 40 320 14" fill="none" stroke="var(--gold, #f5b942)" strokeWidth={3} strokeLinecap="round" />
          </svg></div>
        </div>
        <div aria-hidden>
          <div className="text-label text-text-muted">{t("investor.allocation")}</div>
          <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-surface-raised" dir="ltr">
            {SEGMENTS.map((s) => <span key={s.t} style={{ width: `${s.w}%`, background: s.c }} />)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-data text-text-muted" dir="ltr">
            {SEGMENTS.map((s) => <span key={s.t} className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.c }} />{s.t}</span>)}
          </div>
        </div>
        <div aria-hidden>
          <div className="text-label text-text-muted">DCA</div>
          <div className="mt-2 h-2 w-full rounded-full bg-surface-raised overflow-hidden" dir="ltr"><div className="h-full bg-gold" style={{ width: "37.5%" }} /></div>
          <div className="mt-1.5 text-xs text-text-muted">{fill(t("investor.progress"), { done: 3, total: 8 })}</div>
        </div>
      </Link>
    </div>
  );
}
