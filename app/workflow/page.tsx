"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";
import { loadTrades, type Trade } from "@/lib/journal";
import { loadDraft } from "@/lib/tradePlan";
import { loadHistory } from "@/lib/analysisHistory";
import { computeWorkflowProgress } from "@/lib/workflowProgress";

const ic = "w-5 h-5";
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={ic} aria-hidden="true">
    {children}
  </svg>
);
const ICONS: Record<string, ReactNode> = {
  discover: svg(<><circle cx="12" cy="12" r="8" /><path d="M12 12l4-4" /></>),
  analyze: svg(<path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" />),
  plan: svg(<><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 9h6M9 13h6M9 17h3" /></>),
  execute: svg(<path d="M7 17L17 7M9 7h8v8" />),
  manage: svg(<><path d="M5 7h14M5 12h14M5 17h14" /><circle cx="9" cy="7" r="1.6" fill="currentColor" /><circle cx="15" cy="12" r="1.6" fill="currentColor" /><circle cx="11" cy="17" r="1.6" fill="currentColor" /></>),
  review: svg(<path d="M5 20V10M12 20V4M19 20v-7" />),
};

type Step = { key: string; href: string; tools: { href: string; label: string }[]; status: string | null };

export default function WorkflowPage() {
  const { t } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [analyses, setAnalyses] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  const [watch, setWatch] = useState<number | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setTrades(loadTrades());
      setAnalyses(loadHistory().length);
      setHasDraft(loadDraft() !== null);
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    fetch("/api/me/watchlist")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && Array.isArray(d.items)) setWatch(d.items.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  const showActivity = mounted && isLoaded && !!isSignedIn;
  const p = useMemo(
    () => computeWorkflowProgress({ watchlistCount: showActivity ? watch : null, analysisCount: analyses, hasPlanDraft: hasDraft, trades }),
    [showActivity, watch, analyses, hasDraft, trades],
  );
  const n = (s: string, v: number | string) => s.replace("{n}", String(v));

  const steps: Step[] = [
    {
      key: "discover",
      href: "/radar",
      tools: [
        { href: "/radar", label: t("nav.radar") },
        { href: "/watchlist", label: t("nav.watchlist") },
        { href: "/trade-feed", label: t("nav.tradeFeed") },
      ],
      status: p.watchlist === null ? null : p.watchlist > 0 ? n(t("workflow.status.watchCount"), p.watchlist) : t("workflow.status.watchNone"),
    },
    {
      key: "analyze",
      href: "/analyzer",
      tools: [
        { href: "/analyzer", label: t("workflow.tools.liveChart") },
        { href: "/analyzer", label: t("nav.analyzer") },
      ],
      status: p.analyses > 0 ? n(t("workflow.status.analyses"), p.analyses) : t("workflow.status.analysesNone"),
    },
    {
      key: "plan",
      href: "/trade-plan",
      tools: [
        { href: "/trade-plan", label: t("nav.tradePlan") },
        { href: "/risk", label: t("nav.riskCalculator") },
      ],
      status: p.planInProgress ? t("workflow.status.planDraft") : t("workflow.status.planNone"),
    },
    {
      key: "execute",
      href: "/journal",
      tools: [
        { href: "/journal", label: t("workflow.tools.logTrade") },
      ],
      status: p.executed > 0 ? n(t("workflow.status.executed"), p.executed) : t("workflow.status.executedNone"),
    },
    {
      key: "manage",
      href: "/journal",
      tools: [
        { href: "/journal", label: t("nav.journal") },
        { href: "/trade-plan", label: t("nav.tradePlan") },
      ],
      status: p.open > 0 ? n(t("workflow.status.open"), p.open) : t("workflow.status.openNone"),
    },
    {
      key: "review",
      href: "/journal",
      tools: [
        { href: "/journal", label: t("workflow.tools.analytics") },
      ],
      status:
        p.closed > 0
          ? n(t("workflow.status.closed"), p.closed) + (p.winRate !== null ? ` · ${t("workflow.status.winRate")} ${Math.round(p.winRate)}%` : "")
          : t("workflow.status.closedNone"),
    },
  ];

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <header className="mb-8">
        <div className="text-label text-gold">{t("workflow.eyebrow")}</div>
        <h1 className="mt-2 text-2xl sm:text-3xl font-semibold text-text">{t("workflow.title")}</h1>
        <p className="mt-2 text-sm text-text-muted leading-relaxed">{t("workflow.subtitle")}</p>
        {isLoaded && !isSignedIn && (
          <p className="mt-3 text-sm text-text-muted">
            <Link href="/sign-in" className="text-gold hover:underline">{t("nav.signIn")}</Link> — {t("workflow.guestHint")}
          </p>
        )}
      </header>

      <ol className="relative space-y-4">
        {steps.map((s, i) => (
          <li key={s.key} className="card p-5" data-step={s.key}>
            <div className="flex items-start gap-4">
              <div className="shrink-0 flex flex-col items-center gap-2">
                <span className="w-9 h-9 rounded-full border border-gold/40 bg-gold/10 text-gold flex items-center justify-center font-data text-sm" aria-hidden="true">
                  {i + 1}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-gold">
                  {ICONS[s.key]}
                  <h2 className="text-label">{t(`workflow.steps.${s.key}.name`)}</h2>
                </div>
                <p className="mt-2 text-sm text-text-muted leading-relaxed">{t(`workflow.steps.${s.key}.desc`)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.tools.map((tool) => (
                    <Link key={tool.label} href={tool.href} className="rounded-md border border-line px-2.5 py-1 text-xs text-text-muted hover:text-text hover:border-text-muted transition-colors">
                      {tool.label}
                    </Link>
                  ))}
                </div>
                {showActivity && s.status && (
                  <p className="mt-3 text-xs font-data text-text" data-status={s.key}>{s.status}</p>
                )}
                <Link href={s.href} className="btn-primary mt-4 inline-flex">
                  {t(`workflow.steps.${s.key}.cta`)}
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-xs text-text-muted leading-relaxed">{t("workflow.note")}</p>
    </main>
  );
}
