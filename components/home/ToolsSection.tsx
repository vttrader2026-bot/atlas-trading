"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { IconAnalyzer, IconRisk, IconJournal, IconOverview, IconWatchlist } from "@/components/icons";

export default function ToolsSection() {
  const { t } = useLanguage();
  const steps = ["step1", "step2", "step3", "step4"] as const;
  const others = [
    { href: "/risk", icon: <IconRisk className="w-5 h-5" />, title: t("workspaceSection.riskTitle"), body: t("home.showcase.riskBody") },
    { href: "/journal", icon: <IconJournal className="w-5 h-5" />, title: t("workspaceSection.journalTitle"), body: t("home.showcase.journalBody") },
    { href: "/trade-plan", icon: <IconOverview className="w-5 h-5" />, title: t("nav.tradePlan"), body: t("homeV2.tools.planBody") },
    { href: "/watchlist", icon: <IconWatchlist className="w-5 h-5" />, title: t("nav.watchlist"), body: t("homeV2.tools.watchBody") },
  ];
  return (
    <div className="grid lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3 card card-accent p-7 sm:p-9 flex flex-col home-rise">
        <span className="w-11 h-11 rounded-xl border border-line flex items-center justify-center text-gold bg-gold/5"><IconAnalyzer className="w-6 h-6" /></span>
        <h3 className="mt-5 font-heading text-2xl sm:text-3xl font-bold tracking-tight">{t("homeV2.tools.analyzerTitle")}</h3>
        <p className="mt-3 text-base text-text-muted leading-relaxed max-w-xl">{t("homeV2.tools.analyzerBody")}</p>
        <ol className="mt-7 grid sm:grid-cols-4 gap-3">
          {steps.map((s, i) => (
            <li key={s} className="rounded-xl border border-line bg-bg/40 p-4">
              <span className="font-data text-xs text-gold">{String(i + 1).padStart(2, "0")}</span>
              <div className="mt-1.5 text-base font-medium leading-snug">{t(`home.showcase.${s}`)}</div>
            </li>
          ))}
        </ol>
        <div className="mt-auto pt-8 flex flex-wrap items-center gap-4">
          <Link href="/analyzer" className="btn-primary inline-flex items-center gap-2">{t("homeV2.tools.analyzerCta")} <span aria-hidden className="rtl:rotate-180">{"→"}</span></Link>
          <span className="text-sm text-text-muted">{t("homeV2.tools.analyzerNote")}</span>
        </div>
      </div>

      <ul className="lg:col-span-2 grid gap-3">
        {others.map((o, i) => (
          <li key={o.href} className="home-rise" style={{ animationDelay: `${(i + 1) * 80}ms` }}>
            <Link href={o.href} className="home-tile group flex items-start gap-4 rounded-2xl border border-line bg-surface p-5 h-full">
              <span className="w-10 h-10 shrink-0 rounded-xl border border-line flex items-center justify-center text-text-muted group-hover:text-gold transition-colors">{o.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold group-hover:text-gold transition-colors">{o.title}</span>
                <span className="block mt-1 text-base text-text-muted leading-snug">{o.body}</span>
              </span>
              <span aria-hidden className="text-text-muted group-hover:text-gold transition-colors rtl:rotate-180 mt-1">{"→"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
