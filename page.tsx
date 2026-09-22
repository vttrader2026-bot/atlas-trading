"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTicker24h, formatPrice, Ticker24h } from "@/lib/binance";
import { useLanguage } from "@/lib/i18n";
import { IconRadar, IconAnalyzer, IconJournal, IconRisk } from "@/components/icons";

const HERO_PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

export default function Home() {
  const { t } = useLanguage();
  const [tickers, setTickers] = useState<Record<string, Ticker24h>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const results = await Promise.allSettled(HERO_PAIRS.map((s) => getTicker24h(s)));
      if (cancelled) return;
      const next: Record<string, Ticker24h> = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") next[HERO_PAIRS[i]] = r.value;
      });
      setTickers(next);
    }
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <main>
      {/* HERO */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-14">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-14 items-start">
          <div>
            <h1 className="text-[2.5rem] sm:text-[3.25rem] leading-[1.05] tracking-tight max-w-lg font-semibold">
              {t("home.heroLine1")}
              <br />
              {t("home.heroLine2")}
              <br />
              <span className="text-gold">{t("home.heroLine3")}</span>
            </h1>
            <p className="mt-6 text-text-muted text-lg max-w-md leading-relaxed">
              {t("home.heroBody")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/analyzer"
                className="home-primary-cta"
              >
                {t("home.ctaAnalyze")}
              </Link>
              <Link
                href="/radar"
                className="btn-secondary"
              >
                {t("home.ctaExplore")}
              </Link>
            </div>
          </div>

          {/* Demo analyzer preview — clearly labeled example, not live data */}
          <div className="border border-line rounded-lg bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-4 h-10 border-b border-line">
              <span className="font-data text-sm text-text-muted">BTC/USDT · 4H</span>
              <span className="text-[11px] px-2 py-0.5 rounded border border-line text-text-muted">
                {t("home.exampleLabel")}
              </span>
            </div>
            <div className="p-4 space-y-3">
              <DemoRow label={t("analyzer.marketStructure")}>
                <span className="text-bull text-sm">Bullish</span>
              </DemoRow>
              <DemoRow label={t("analyzer.currentCondition")}>
                <span className="text-sm">Pullback</span>
              </DemoRow>
              <div className="grid grid-cols-2 gap-3">
                <DemoStat label={t("home.demoSupport")} value="$61,200" tone="bull" />
                <DemoStat label={t("home.demoResistance")} value="$64,800" tone="bear" />
              </div>
              <DemoRow label={t("analyzer.whatToWatch")}>
                <span className="text-sm text-text-muted">{t("home.demoWatch")}</span>
              </DemoRow>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE MARKET SNAPSHOT */}
      <section className="max-w-6xl mx-auto px-6 pb-14">
        <div className="border border-line rounded-lg bg-surface overflow-hidden">
          <div className="flex items-center gap-2 px-4 h-9 border-b border-line">
            <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
            <span className="text-xs text-text-muted">{t("home.snapshotTitle")}</span>
          </div>
          <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
            {HERO_PAIRS.map((symbol) => {
              const tk = tickers[symbol];
              const change = tk ? parseFloat(tk.priceChangePercent) : 0;
              const positive = change >= 0;
              return (
                <div key={symbol} className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-sm text-text-muted">
                    {symbol.replace("USDT", " / USDT")}
                  </span>
                  <div className="flex items-baseline gap-3">
                    <span className="font-data text-base">
                      {tk ? `$${formatPrice(tk.lastPrice)}` : "…"}
                    </span>
                    <span
                      className={`font-data text-xs w-16 text-right ${
                        positive ? "text-bull" : "text-bear"
                      }`}
                    >
                      {tk ? `${positive ? "+" : ""}${change.toFixed(2)}%` : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ANALYZER — FLAGSHIP */}
      <section className="max-w-6xl mx-auto px-6 pb-14">
        <div className="border border-line rounded-lg bg-surface p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="w-10 h-10 rounded-md border border-gold/30 flex items-center justify-center text-gold shrink-0">
              <IconAnalyzer className="w-5 h-5" />
            </span>
            <div>
              <div className="font-heading text-xl font-semibold tracking-tight">{t("home.showcase.analyzerTitle")}</div>
              <p className="mt-2 text-sm text-text-muted leading-relaxed max-w-xl">
                {t("home.showcase.analyzerBody")}
              </p>
            </div>
          </div>
          <div className="mt-6 grid sm:grid-cols-4 gap-3">
            <FlowStep n={1} label={t("home.showcase.step1")} />
            <FlowStep n={2} label={t("home.showcase.step2")} />
            <FlowStep n={3} label={t("home.showcase.step3")} />
            <FlowStep n={4} label={t("home.showcase.step4")} />
          </div>
          <Link
            href="/analyzer"
            className="home-primary-cta mt-6"
          >
            {t("home.ctaAnalyze")}
          </Link>
        </div>
      </section>

      {/* RADAR PREVIEW */}
      <section className="max-w-6xl mx-auto px-6 pb-14">
        <Link
          href="/radar"
          className="group flex items-center gap-4 border border-line rounded-lg bg-surface p-6 hover:border-text-muted transition-colors"
        >
          <span className="w-10 h-10 rounded-md border border-line flex items-center justify-center text-text-muted group-hover:text-gold transition-colors shrink-0">
            <IconRadar className="w-5 h-5" />
          </span>
          <div className="flex-1">
            <div className="text-base group-hover:text-gold transition-colors">
              {t("home.showcase.radarTitle")}
            </div>
            <p className="mt-1 text-sm text-text-muted leading-relaxed max-w-xl">
              {t("home.showcase.radarBody")}
            </p>
          </div>
          <span className="text-text-muted group-hover:text-gold transition-colors text-sm shrink-0">
            {t("home.showcase.radarCta")} →
          </span>
        </Link>
      </section>

      {/* ATLAS WORKFLOW */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-semibold tracking-tight text-center">{t("home.workflow.title")}</h2>
        <div className="mt-8 grid sm:grid-cols-6 gap-4">
          <WorkflowStep n={1} label={t("home.workflow.discover")} />
          <WorkflowStep n={2} label={t("home.workflow.analyze")} />
          <WorkflowStep n={3} label={t("home.workflow.plan")} />
          <WorkflowStep n={4} label={t("home.workflow.control")} />
          <WorkflowStep n={5} label={t("home.workflow.review")} />
          <WorkflowStep n={6} label={t("home.workflow.improve")} last />
        </div>
      </section>

      {/* RISK + JOURNAL */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid sm:grid-cols-2 gap-4">
          <ToolCard
            icon={<IconRisk className="w-5 h-5" />}
            title={t("home.showcase.riskTitle")}
            body={t("home.showcase.riskBody")}
            href="/risk"
          />
          <ToolCard
            icon={<IconJournal className="w-5 h-5" />}
            title={t("home.showcase.journalTitle")}
            body={t("home.showcase.journalBody")}
            href="/journal"
          />
        </div>
      </section>

      {/* COMMUNITY */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="border border-line rounded-lg p-6 bg-surface">
            <div className="text-sm text-text-muted">{t("home.community.freeLabel")}</div>
            <div className="mt-1 text-lg">{t("home.community.freeTitle")}</div>
            <p className="mt-2 text-sm text-text-muted leading-relaxed">
              {t("home.community.freeBody")}
            </p>
            <a
              href="https://t.me/atlastradingcrypto"
              target="_blank"
              rel="noopener noreferrer"
              className="home-primary-cta mt-5"
            >
              {t("home.community.joinFree")}
            </a>
          </div>

          <div className="border border-gold/30 rounded-lg p-6 bg-surface">
            <div className="text-sm text-gold">{t("home.community.vipLabel")}</div>
            <div className="mt-1 text-lg">{t("home.community.vipTitle")}</div>
            <p className="mt-2 text-sm text-text-muted leading-relaxed">
              {t("home.community.vipBody")}
            </p>
            <a
              href="https://t.me/Atlascryptotrader"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary mt-5 hover:border-gold! hover:text-gold!"
            >
              {t("home.community.contactVip")}
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-semibold tracking-tight">{t("home.faq.heading")}</h2>
        <div className="mt-6 border-t border-line">
          <Faq q={t("home.faq.q1")} a={t("home.faq.a1")} />
          <Faq q={t("home.faq.q2")} a={t("home.faq.a2")} />
          <Faq q={t("home.faq.q3")} a={t("home.faq.a3")} />
          <Faq q={t("home.faq.q4")} a={t("home.faq.a4")} />
        </div>
      </section>
    </main>
  );
}

function DemoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-muted">{label}</span>
      {children}
    </div>
  );
}

function DemoStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "bull" | "bear";
}) {
  return (
    <div className={`rounded-md border p-2.5 ${tone === "bull" ? "border-bull/30" : "border-bear/30"}`}>
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className={`font-data text-sm mt-0.5 ${tone === "bull" ? "text-bull" : "text-bear"}`}>
        {value}
      </div>
    </div>
  );
}

function FlowStep({ n, label }: { n: number; label: string }) {
  return (
    <div className="border border-line rounded-md p-3">
      <span className="font-data text-xs text-gold">{String(n).padStart(2, "0")}</span>
      <p className="mt-1.5 text-sm">{label}</p>
    </div>
  );
}

function WorkflowStep({ n, label, last }: { n: number; label: string; last?: boolean }) {
  return (
    <div className="flex sm:flex-col items-center gap-3 sm:gap-2 text-center">
      <div className="flex items-center gap-3 sm:flex-col sm:gap-2 flex-1">
        <span className="w-8 h-8 rounded-full border border-gold/40 text-gold flex items-center justify-center text-sm font-data shrink-0">
          {n}
        </span>
        <span className="text-sm">{label}</span>
      </div>
      {!last && (
        <span className="text-text-muted hidden sm:block text-lg" aria-hidden>
          →
        </span>
      )}
    </div>
  );
}

function ToolCard({
  icon,
  title,
  body,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group border border-line rounded-lg p-6 bg-surface hover:border-text-muted transition-colors"
    >
      <span className="w-9 h-9 rounded-md border border-line flex items-center justify-center text-text-muted group-hover:text-gold transition-colors">
        {icon}
      </span>
      <div className="mt-3 text-base group-hover:text-gold transition-colors">{title}</div>
      <p className="mt-1.5 text-sm text-text-muted leading-relaxed">{body}</p>
    </Link>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="py-5 border-b border-line">
      <div className="text-sm">{q}</div>
      <p className="mt-2 text-sm text-text-muted leading-relaxed max-w-2xl">{a}</p>
    </div>
  );
}
