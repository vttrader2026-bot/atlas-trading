"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";
import { loadTrades, type Trade } from "@/lib/journal";
import { loadDraft } from "@/lib/tradePlan";
import { loadHistory } from "@/lib/analysisHistory";
import { computeWorkflowProgress } from "@/lib/workflowProgress";

const ic = "w-7 h-7";
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

type Step = {
  key: string;
  href: string;
  /** Theme token for this step's colour identity (re-defined for light mode in globals.css). */
  accent: string;
  /** True when saved data shows real activity for this step (only displayed when signed in). */
  active: boolean;
  tools: { href: string; label: string }[];
  status: string | null;
};

export default function WorkflowPage() {
  const { t } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [analyses, setAnalyses] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  const [watch, setWatch] = useState<number | null>(null);

  // ACCESS-v1: personal data is read only for an authenticated user; visitors never load it.
  useEffect(() => {
    if (!isLoaded) return;
    void Promise.resolve().then(() => {
      if (isSignedIn) {
        setTrades(loadTrades());
        setAnalyses(loadHistory().length);
        setHasDraft(loadDraft() !== null);
      } else {
        setTrades([]);
        setAnalyses(0);
        setHasDraft(false);
        setWatch(null);
      }
      setMounted(true);
    });
  }, [isLoaded, isSignedIn]);

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
      accent: "var(--grp-coinbase50)",
      active: p.watchlist !== null && p.watchlist > 0,
      href: "/radar",
      tools: [
        { href: "/radar", label: t("nav.radar") },
        { href: "/market-intelligence", label: t("nav.marketIntel") },
        { href: "/watchlist", label: t("nav.watchlist") },
        { href: "/trade-feed", label: t("nav.tradeFeed") },
      ],
      status: p.watchlist === null ? null : p.watchlist > 0 ? n(t("workflow.status.watchCount"), p.watchlist) : t("workflow.status.watchNone"),
    },
    {
      key: "analyze",
      accent: "var(--grp-madeInUsa)",
      active: p.analyses > 0,
      href: "/analyzer",
      tools: [
        { href: "/analyzer", label: t("workflow.tools.liveChart") },
        { href: "/analyzer", label: t("nav.analyzer") },
      ],
      status: p.analyses > 0 ? n(t("workflow.status.analyses"), p.analyses) : t("workflow.status.analysesNone"),
    },
    {
      key: "plan",
      accent: "var(--gold)",
      active: p.planInProgress,
      href: "/trade-plan",
      tools: [
        { href: "/trade-plan", label: t("nav.tradePlan") },
        { href: "/risk", label: t("nav.riskCalculator") },
      ],
      status: p.planInProgress ? t("workflow.status.planDraft") : t("workflow.status.planNone"),
    },
    {
      key: "execute",
      accent: "var(--grp-worldLiberty)",
      active: p.executed > 0,
      href: "/journal",
      tools: [
        { href: "/journal", label: t("workflow.tools.logTrade") },
      ],
      status: p.executed > 0 ? n(t("workflow.status.executed"), p.executed) : t("workflow.status.executedNone"),
    },
    {
      key: "manage",
      accent: "var(--bull)",
      active: p.open > 0,
      href: "/journal",
      tools: [
        { href: "/journal", label: t("nav.journal") },
        { href: "/trade-plan", label: t("nav.tradePlan") },
      ],
      status: p.open > 0 ? n(t("workflow.status.open"), p.open) : t("workflow.status.openNone"),
    },
    {
      key: "review",
      accent: "var(--grp-grayscale)",
      active: p.closed > 0,
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
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-10 sm:py-16">
      <header className="wf-rise mb-10 sm:mb-14" style={{ "--i": 0 } as CSSProperties}>
        <div className="flex items-center gap-2.5 font-data text-xs tracking-[0.22em] text-gold">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="wf-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
          </span>
          {t("workflow.eyebrow")}
        </div>
        <h1 className="mt-4 font-heading text-3xl sm:text-5xl font-semibold leading-[1.1] tracking-tight text-text">{t("workflow.title")}</h1>
        <p className="mt-4 max-w-2xl text-base sm:text-lg leading-relaxed text-text-muted">{t("workflow.subtitle")}</p>
        <div className="mt-6 flex gap-1.5" aria-hidden="true">
          {steps.map((s) => (
            <span key={s.key} className="h-1 flex-1 rounded-full opacity-80" style={{ background: s.accent }} />
          ))}
        </div>
        {isLoaded && !isSignedIn && (
          <p className="mt-5 text-sm text-text-muted">
            <Link href="/sign-in" className="font-medium text-gold underline-offset-4 hover:underline">{t("nav.signIn")}</Link> — {t("workflow.guestHint")}
          </p>
        )}
      </header>

      <ol className="relative">
        {/* the rail that connects the six steps */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-6 bottom-6 w-px start-[calc(1.5rem-0.5px)] sm:start-[calc(1.75rem-0.5px)]"
          style={{ background: `linear-gradient(to bottom, ${steps.map((s) => s.accent).join(", ")})`, opacity: 0.55 }}
        />
        {steps.map((s, i) => {
          const lit = showActivity && s.active;
          return (
            <li
              key={s.key}
              id={`step-${s.key}`}
              data-step={s.key}
              className="wf-rise group relative grid grid-cols-[3rem_1fr] sm:grid-cols-[3.5rem_1fr] gap-3 sm:gap-6 pb-6 sm:pb-9 last:pb-0"
              style={{ "--i": i + 1, "--acc": s.accent } as CSSProperties}
            >
              <div className="relative z-10 flex justify-center pt-5">
                <span
                  aria-hidden="true"
                  className={`flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full border-2 border-[var(--acc)] font-data text-sm sm:text-base font-semibold transition-all duration-300 group-hover:scale-105 ${
                    lit ? "bg-[var(--acc)] text-[var(--bg)] shadow-[0_0_0_6px_color-mix(in_srgb,var(--acc)_18%,transparent)]" : "bg-bg text-[var(--acc)] group-hover:shadow-[0_0_0_6px_color-mix(in_srgb,var(--acc)_14%,transparent)]"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-line border-s-4 border-s-[var(--acc)] bg-surface p-5 sm:p-8 shadow-[var(--shadow-card)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[color-mix(in_srgb,var(--acc)_45%,var(--line))] group-hover:border-s-[var(--acc)]">
                <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--acc) 11%, transparent), transparent 60%)" }} />
                <span aria-hidden="true" className="pointer-events-none absolute -bottom-6 end-3 select-none font-data text-[7rem] sm:text-[9rem] font-bold leading-none text-[var(--acc)] opacity-[0.06]">
                  {i + 1}
                </span>

                <div className="relative">
                  <div className="flex items-center gap-4">
                    <span className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--acc)_40%,transparent)] bg-[color-mix(in_srgb,var(--acc)_14%,transparent)] text-[var(--acc)] transition-transform duration-300 group-hover:rotate-[-4deg] group-hover:scale-105">
                      {ICONS[s.key]}
                    </span>
                    <div className="min-w-0">
                      <div className="font-data text-[0.7rem] tracking-[0.22em] text-[var(--acc)]">{`${t("workflow.stepWord")} ${String(i + 1).padStart(2, "0")}`}</div>
                      <h2 className="font-heading text-2xl sm:text-3xl font-semibold leading-tight tracking-wide text-text">{t(`workflow.steps.${s.key}.name`)}</h2>
                    </div>
                  </div>

                  <p className="mt-4 max-w-xl text-base sm:text-lg leading-relaxed text-text-muted">{t(`workflow.steps.${s.key}.desc`)}</p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {s.tools.map((tool) => (
                      <Link
                        key={tool.label}
                        href={tool.href}
                        className="rounded-lg border border-line bg-bg/60 px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-[var(--acc)] hover:text-text"
                      >
                        {tool.label}
                      </Link>
                    ))}
                  </div>

                  {showActivity && s.status && (
                    <p className="mt-5 flex items-center gap-2.5 rounded-lg border border-line bg-bg/70 px-3.5 py-2.5 font-data text-xs sm:text-sm text-text" data-status={s.key}>
                      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${lit ? "bg-[var(--acc)]" : "bg-line"}`} />
                      {s.status}
                    </p>
                  )}

                  <Link
                    href={s.href}
                    className="mt-6 inline-flex w-full sm:w-auto items-center justify-center gap-3 rounded-xl bg-[var(--acc)] px-6 py-3.5 text-base font-semibold text-[var(--bg)] shadow-[0_8px_24px_-10px_var(--acc)] transition-all duration-300 hover:brightness-110 hover:shadow-[0_12px_28px_-8px_var(--acc)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc)]"
                  >
                    {t(`workflow.steps.${s.key}.cta`)}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <aside className="mt-10 rounded-xl border border-line bg-surface/60 p-5 flex flex-wrap items-center gap-4" data-investor-link>
        <div className="flex-1 min-w-56">
          <h2 className="font-heading text-base font-semibold">{t("investor.workflowTitle")}</h2>
          <p className="mt-1 text-sm text-text-muted leading-relaxed">{t("investor.workflowBody")}</p>
        </div>
        <Link href="/investor" className="btn-secondary">{t("investor.workflowCta")}</Link>
      </aside>

      <p className="mt-10 border-t border-line pt-5 font-data text-xs leading-relaxed text-text-muted">{t("workflow.note")}</p>
    </main>
  );
}
