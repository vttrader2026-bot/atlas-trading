"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { IconOverview, IconJournal, IconWatchlist, IconRisk } from "@/components/icons";
import InvestorPhone from "@/components/home/InvestorPhone";

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

      {/* HOME-PHONE-v1: smartphone showcase with clearly labeled DEMO data (replaces the earlier decorative card). */}
      <Link href="/investor" aria-label={t("investor.homeCta")} className="lg:col-span-2 home-rise flex items-center justify-center rounded-2xl border border-line bg-surface p-6 sm:p-7" style={{ animationDelay: "80ms" }}>
        <InvestorPhone />
      </Link>
    </div>
  );
}
