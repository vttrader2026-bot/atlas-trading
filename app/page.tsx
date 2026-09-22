"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTicker24h, formatPrice, Ticker24h } from "@/lib/binance";
import { useLanguage } from "@/lib/i18n";
import { IconRadar, IconAnalyzer, IconJournal, IconRisk } from "@/components/icons";
import type { PublishedTrade } from "@/lib/tradeFeed";

const HERO_PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

export default function Home() {
  const { t } = useLanguage();
  const [tickers, setTickers] = useState<Record<string, Ticker24h>>({});
  const [latestTrades, setLatestTrades] = useState<PublishedTrade[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/trade-feed")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.trades)) {
          setLatestTrades(data.trades.slice(0, 3));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
      <section className="max-w-6xl mx-auto px-6 pt-20 sm:pt-28 pb-16 sm:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-14 items-start">
          <div>
            <span className="inline-flex items-center gap-2 text-label px-3 py-1.5 rounded-full border border-line bg-surface/60">
              <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
              {t("home.liveMarket")}
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl leading-[1.04] tracking-tight max-w-xl font-bold mt-5">
              {t("home.heroLine1")}
              <br />
              {t("home.heroLine2")}
              <br />
              <span className="text-gold">{t("home.heroLine3")}</span>
            </h1>
            <p className="mt-6 text-white/70 text-lg sm:text-xl max-w-md leading-relaxed">
              {t("home.heroBody")}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/analyzer" className="btn-primary">
                {t("home.ctaAnalyze")}
              </Link>
              <Link href="/radar" className="btn-secondary">
                {t("home.ctaExplore")}
              </Link>
            </div>
          </div>

          {/* Demo analyzer preview - clearly labeled example, not live data */}
          <div className="rounded-2xl border border-white/10 bg-[#0b0f16] p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
            <div className="flex items-center justify-between px-5 h-11 border-b border-line bg-surface-raised/60">
              <span className="font-data text-base text-white/70">BTC/USDT · 4H</span>
              <span className="text-label px-2.5 py-1 rounded-full border border-line">
                {t("home.exampleLabel")}
              </span>
            </div>
            <div className="p-5 space-y-4">
              <DemoRow label={t("analyzer.marketStructure")}>
                <span className="text-bull text-base font-medium">Bullish</span>
              </DemoRow>
              <DemoRow label={t("analyzer.currentCondition")}>
                <span className="text-base font-medium">Pullback</span>
              </DemoRow>
              <div className="grid grid-cols-2 gap-3">
                <DemoStat label={t("home.demoSupport")} value="$61,200" tone="bull" />
                <DemoStat label={t("home.demoResistance")} value="$64,800" tone="bear" />
              </div>
              <DemoRow label={t("analyzer.whatToWatch")}>
                <span className="text-base text-white/70">{t("home.demoWatch")}</span>
              </DemoRow>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE MARKET SNAPSHOT */}
      <section className="max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
        <div className="rounded-2xl border border-white/10 bg-[#0b0f16] p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
          <div className="flex items-center gap-2 px-5 h-10 border-b border-line">
            <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
            <span className="text-label">{t("home.snapshotTitle")}</span>
          </div>
          <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
            {HERO_PAIRS.map((symbol) => {
              const tk = tickers[symbol];
              const change = tk ? parseFloat(tk.priceChangePercent) : 0;
              const positive = change >= 0;
              return (
                <div key={symbol} className="flex items-center justify-between px-5 py-4">
                  <span className="text-base text-white/70">
                    {symbol.replace("USDT", " / USDT")}
                  </span>
                  <div className="flex items-baseline gap-3">
                    <span className="font-data text-base font-medium">
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

      {/* ANALYZER - FLAGSHIP */}
      <section className="max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
        <div className="rounded-2xl border border-white/10 bg-[#0b0f16] p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
          <div className="flex items-start gap-4">
            <span className="w-11 h-11 rounded-xl border border-gold/30 bg-gold/10 flex items-center justify-center text-gold shrink-0">
              <IconAnalyzer className="w-5 h-5" />
            </span>
            <div>
              <div className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
                {t("home.showcase.analyzerTitle")}
              </div>
              <p className="mt-2.5 text-base sm:text-base text-white/70 leading-relaxed max-w-xl">
                {t("home.showcase.analyzerBody")}
              </p>
            </div>
          </div>
          <div className="mt-7 grid sm:grid-cols-4 gap-3">
            <FlowStep n={1} label={t("home.showcase.step1")} />
            <FlowStep n={2} label={t("home.showcase.step2")} />
            <FlowStep n={3} label={t("home.showcase.step3")} />
            <FlowStep n={4} label={t("home.showcase.step4")} />
          </div>
          <Link href="/analyzer" className="btn-primary mt-4">
            {t("home.ctaAnalyze")}
          </Link>
        </div>
      </section>

      {/* RADAR PREVIEW */}
      <section className="max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
        <Link
          href="/radar"
          className="flex items-center gap-4 group rounded-2xl border border-white/10 bg-[#0b0f16] p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]"
        >
          <span className="w-11 h-11 rounded-xl border border-line flex items-center justify-center text-white/70 group-hover:text-gold transition-colors shrink-0">
            <IconRadar className="w-5 h-5" />
          </span>
          <div className="flex-1">
            <div className="text-base font-medium group-hover:text-gold transition-colors">
              {t("home.showcase.radarTitle")}
            </div>
            <p className="mt-1 text-base text-white/70 leading-relaxed max-w-xl">
              {t("home.showcase.radarBody")}
            </p>
          </div>
          <span className="text-white/70 group-hover:text-gold transition-colors text-base shrink-0">
            {t("home.showcase.radarCta")} →
          </span>
        </Link>
      </section>

      {/* LATEST TRADE PLANS */}
      {latestTrades.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
              {t("home.latestTrades.title")}
            </h2>
            <Link href="/trade-feed" className="text-xs text-white/70 hover:text-gold transition-colors">
              {t("home.latestTrades.viewAll")} →
            </Link>
          </div>
          <div className="mt-5 grid sm:grid-cols-3 gap-3">
            {latestTrades.map((trade) => (
              <Link
                key={trade.id}
                href="/trade-feed"
                className="rounded-2xl border border-white/10 bg-[#0b0f16] p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-data text-base font-medium">{trade.pair}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full border text-[11px] ${
                      trade.direction === "Long" ? "border-bull/40 text-bull" : "border-bear/40 text-bear"
                    }`}
                  >
                    {trade.direction === "Long" ? t("risk.long") : t("risk.short")}
                  </span>
                </div>
                <div className="mt-2 text-xs text-white/70">
                  {t("tradePlan.entry")}: <span className="font-data text-text">{trade.entryZone}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ATLAS WORKFLOW */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center">
          {t("home.workflow.title")}
        </h2>
        <div className="mt-10 grid sm:grid-cols-6 gap-4">
          <WorkflowStep n={1} label={t("home.workflow.discover")} />
          <WorkflowStep n={2} label={t("home.workflow.analyze")} />
          <WorkflowStep n={3} label={t("home.workflow.plan")} />
          <WorkflowStep n={4} label={t("home.workflow.control")} />
          <WorkflowStep n={5} label={t("home.workflow.review")} />
          <WorkflowStep n={6} label={t("home.workflow.improve")} last />
        </div>
      </section>

      {/* RISK + JOURNAL */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
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
          <div className="rounded-2xl border border-white/10 bg-[#0b0f16] p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
            <div className="text-label">{t("home.community.freeLabel")}</div>
            <div className="mt-2 text-lg font-semibold">{t("home.community.freeTitle")}</div>
            <p className="mt-2 text-base text-white/70 leading-relaxed">
              {t("home.community.freeBody")}
            </p>
            
                        <a
              href="https://t.me/atlastradingcrypto"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-4"
            >
              {t("home.community.joinFree")}
            </a>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0b0f16] p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
            <div className="text-label text-gold">{t("home.community.vipLabel")}</div>
            <div className="mt-2 text-lg font-semibold">{t("home.community.vipTitle")}</div>
            <p className="mt-2 text-base text-white/70 leading-relaxed">
              {t("home.community.vipBody")}
            </p>
            <a
              href="https://t.me/Atlascryptotrader"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary mt-6 hover:border-gold! hover:text-gold!"
            >
              {t("home.community.contactVip")}
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("home.faq.heading")}</h2>
        <div className="mt-8 border-t border-line">
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
      <span className="text-xs text-white/70">{label}</span>
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
    <div className={`rounded-lg border p-3 ${tone === "bull" ? "border-bull/30" : "border-bear/30"}`}>
      <div className="text-[11px] text-white/70">{label}</div>
      <div className={`font-data text-base font-medium mt-0.5 ${tone === "bull" ? "text-bull" : "text-bear"}`}>
        {value}
      </div>
    </div>
  );
}

function FlowStep({ n, label }: { n: number; label: string }) {
  return (
    <div className="border border-line rounded-lg p-3.5 bg-surface/40">
      <span className="font-data text-xs text-gold">{String(n).padStart(2, "0")}</span>
      <p className="mt-1.5 text-base">{label}</p>
    </div>
  );
}

function WorkflowStep({ n, label, last }: { n: number; label: string; last?: boolean }) {
  return (
    <div className="flex sm:flex-col items-center gap-3 sm:gap-2.5 text-center">
      <div className="flex items-center gap-3 sm:flex-col sm:gap-2.5 flex-1">
        <span className="w-9 h-9 rounded-full border border-gold/40 bg-gold/5 text-gold flex items-center justify-center text-base font-data shrink-0">
          {n}
        </span>
        <span className="text-base">{label}</span>
      </div>
      {!last && (
        <span className="text-white/70 hidden sm:block text-lg" aria-hidden>
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
    <Link href={href} className="rounded-2xl border border-white/10 bg-[#0b0f16] p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
      <span className="w-10 h-10 rounded-xl border border-line flex items-center justify-center text-white/70 group-hover:text-gold transition-colors">
        {icon}
      </span>
      <div className="mt-4 text-base font-medium group-hover:text-gold transition-colors">{title}</div>
      <p className="mt-1.5 text-base text-white/70 leading-relaxed">{body}</p>
    </Link>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="py-5 border-b border-line">
      <div className="text-base font-medium">{q}</div>
      <p className="mt-2 text-base text-white/70 leading-relaxed max-w-2xl">{a}</p>
    </div>
  );
}






