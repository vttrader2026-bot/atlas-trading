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
            <p className="mt-6 text-text-muted text-lg sm:text-xl max-w-md leading-relaxed">
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
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
            <div className="flex items-center justify-between px-5 h-11 border-b border-line bg-surface-raised/60">
              <span className="font-data text-base text-text-muted">BTC/USDT · 4H</span>
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
                <span className="text-base text-text-muted">{t("home.demoWatch")}</span>
              </DemoRow>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE MARKET SNAPSHOT */}
      <section className="max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
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
                  <span className="text-base text-text-muted">
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
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
          <div className="flex items-start gap-4">
            <span className="w-11 h-11 rounded-xl border border-gold/30 bg-gold/10 flex items-center justify-center text-gold shrink-0">
              <IconAnalyzer className="w-5 h-5" />
            </span>
            <div>
              <div className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
                {t("home.showcase.analyzerTitle")}
              </div>
              <p className="mt-2.5 text-base sm:text-base text-text-muted leading-relaxed max-w-xl">
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
          className="flex items-center gap-4 group rounded-2xl border border-line bg-surface p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]"
        >
          <span className="w-11 h-11 rounded-xl border border-line flex items-center justify-center text-text-muted group-hover:text-gold transition-colors shrink-0">
            <IconRadar className="w-5 h-5" />
          </span>
          <div className="flex-1">
            <div className="text-base font-medium group-hover:text-gold transition-colors">
              {t("home.showcase.radarTitle")}
            </div>
            <p className="mt-1 text-base text-text-muted leading-relaxed max-w-xl">
              {t("home.showcase.radarBody")}
            </p>
          </div>
          <span className="text-text-muted group-hover:text-gold transition-colors text-base shrink-0">
            {t("home.showcase.radarCta")} →
          </span>
        </Link>
      </section>

      {/* SPOT SETUPS PROMO */}
      <section className="max-w-6xl mx-auto px-6 pb-10">
        <div className="card card-accent p-6 sm:p-8 grid sm:grid-cols-[1fr_auto] gap-6 sm:gap-8 items-center">
          <div>
            <h3 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
              {t("home.spotPromo.title")}
            </h3>
            <p className="mt-2.5 text-text-muted max-w-md">{t("home.spotPromo.body")}</p>
            <Link href="/trade-feed" className="btn-primary mt-5 inline-flex">
              {t("home.spotPromo.cta")}
            </Link>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 w-full sm:w-72 shadow-[0_0_40px_rgba(227,162,61,0.12)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconBtc className="w-6 h-6 shrink-0" />
                <span className="font-data text-sm font-medium">BTC/USDT</span>
              </div>
              <span className="px-2 py-0.5 rounded-full border border-line text-[10px] tracking-wide text-text-muted">
                {t("home.spotPromo.sampleTag")}
              </span>
            </div>

            <div className="mt-3 font-data text-2xl font-bold">
              {tickers["BTCUSDT"] ? `$${formatPrice(tickers["BTCUSDT"].lastPrice)}` : "—"}
            </div>
            <div className="text-[11px] text-text-muted">{t("home.spotPromo.currentPrice")}</div>

            <div className="mt-4 pt-4 border-t border-line grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-wide">{t("tradePlan.entry")}</div>
                <div className="font-data text-sm mt-0.5">$61,250</div>
              </div>
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-wide">TP</div>
                <div className="font-data text-sm mt-0.5 text-bull">$64,000</div>
              </div>
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-wide">SL</div>
                <div className="font-data text-sm mt-0.5 text-bear">$59,800</div>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-text-muted text-center">{t("home.spotPromo.disclaimer")}</div>
          </div>
        </div>
      </section>

      {/* LATEST TRADE PLANS */}
      {latestTrades.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
              {t("home.latestTrades.title")}
            </h2>
            <Link href="/trade-feed" className="text-xs text-text-muted hover:text-gold transition-colors">
              {t("home.latestTrades.viewAll")} →
            </Link>
          </div>
          <div className="mt-5 grid sm:grid-cols-3 gap-3">
            {latestTrades.map((trade) => (
              <Link
                key={trade.id}
                href="/trade-feed"
                className="rounded-2xl border border-line bg-surface p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]"
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
                <div className="mt-2 text-xs text-text-muted">
                  {t("tradePlan.entry")}: <span className="font-data text-text">{trade.entryZone}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* FREE VS VIP */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center">
          {t("home.plans.title")}
        </h2>
        <p className="mt-3 text-text-muted text-center max-w-xl mx-auto">
          {t("home.plans.subtitle")}
        </p>

        <div className="mt-10 card overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[1.4fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr] border-b border-line">
            <div className="px-4 sm:px-6 py-4" />
            <div className="px-3 sm:px-6 py-4 text-center border-l border-line">
              <div className="text-label">{t("home.plans.freeLabel")}</div>
            </div>
            <div className="px-3 sm:px-6 py-4 text-center border-l border-line bg-gold/5">
              <div className="text-label text-gold">{t("home.plans.vipLabel")}</div>
            </div>
          </div>

          {/* Feature rows */}
          {[
            { key: "alerts", free: "teaser", vip: "full" },
            { key: "entryZone", free: false, vip: true },
            { key: "stopLoss", free: false, vip: true },
            { key: "targets", free: false, vip: true },
            { key: "monitoring", free: false, vip: true },
            { key: "channel", free: "public", vip: "vip" },
          ].map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[1.4fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr] border-b border-line last:border-b-0"
            >
              <div className="px-4 sm:px-6 py-4 text-sm sm:text-base">
                {t(`home.plans.rows.${row.key}`)}
              </div>
              <div className="px-3 sm:px-6 py-4 flex items-center justify-center border-l border-line text-center">
                <PlanCell value={row.free} />
              </div>
              <div className="px-3 sm:px-6 py-4 flex items-center justify-center border-l border-line bg-gold/5 text-center">
                <PlanCell value={row.vip} />
              </div>
            </div>
          ))}

          {/* CTA row */}
          <div className="grid grid-cols-[1.4fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr]">
            <div className="px-4 sm:px-6 py-5" />
            <div className="px-3 sm:px-6 py-5 flex items-center justify-center border-l border-line">
              <a
                href="https://t.me/atlastradingcrypto"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs sm:text-sm px-3 sm:px-5 py-2 sm:py-2.5 w-full"
              >
                {t("home.community.joinFree")}
              </a>
            </div>
            <div className="px-3 sm:px-6 py-5 flex items-center justify-center border-l border-line bg-gold/5">
              <a
                href="https://t.me/Atlascryptotrader"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-xs sm:text-sm px-3 sm:px-5 py-2 sm:py-2.5 w-full"
              >
                {t("home.community.contactVip")}
              </a>
            </div>
          </div>
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
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
            <div className="text-label">{t("home.community.freeLabel")}</div>
            <div className="mt-2 text-lg font-semibold">{t("home.community.freeTitle")}</div>
            <p className="mt-2 text-base text-text-muted leading-relaxed">
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

          <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
            <div className="text-label text-gold">{t("home.community.vipLabel")}</div>
            <div className="mt-2 text-lg font-semibold">{t("home.community.vipTitle")}</div>
            <p className="mt-2 text-base text-text-muted leading-relaxed">
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
    <div className={`rounded-lg border p-3 ${tone === "bull" ? "border-bull/30" : "border-bear/30"}`}>
      <div className="text-[11px] text-text-muted">{label}</div>
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

function IconBtc({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#F7931A" />
      <path
        fill="#fff"
        d="M22.5 14.1c.3-2.1-1.3-3.2-3.5-4l.7-2.9-1.7-.4-.7 2.8c-.5-.1-.9-.2-1.4-.3l.7-2.8-1.7-.4-.7 2.9c-.4-.1-.7-.2-1.1-.3v0l-2.3-.6-.5 1.8s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.2c0 .1.1.1.2.1h-.2l-1.1 4.5c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.2.5c.4.1.8.2 1.2.3l-.7 2.9 1.7.4.7-2.9c.5.1.9.2 1.4.3l-.7 2.9 1.7.4.7-2.9c2.9.5 5.1.3 6-2.3.7-2.1 0-3.3-1.5-4.1 1.1-.3 1.9-1 2.1-2.5zm-3.9 5.5c-.5 2.1-4 1-5.1.7l.9-3.7c1.1.3 4.7.8 4.2 3zm.5-5.6c-.5 1.9-3.4.9-4.3.7l.8-3.4c.9.2 4 .6 3.5 2.7z"
      />
    </svg>
  );
}

function PlanCell({ value }: { value: boolean | "teaser" | "full" | "public" | "vip" }) {
  const { t } = useLanguage();
  if (value === true) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5 text-bull shrink-0">
        <path
          d="M4 10.5L8 14.5L16 5.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (value === false) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-text-muted/50 shrink-0">
        <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  const label =
    value === "teaser"
      ? t("home.plans.values.teaser")
      : value === "full"
      ? t("home.plans.values.full")
      : value === "public"
      ? t("home.plans.values.publicGroup")
      : t("home.plans.values.vipChannel");
  return <span className="text-xs sm:text-sm font-medium">{label}</span>;
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
    <Link href={href} className="group rounded-2xl border border-line bg-surface p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
      <span className="w-10 h-10 rounded-xl border border-line flex items-center justify-center text-text-muted group-hover:text-gold transition-colors">
        {icon}
      </span>
      <div className="mt-4 text-base font-medium group-hover:text-gold transition-colors">{title}</div>
      <p className="mt-1.5 text-base text-text-muted leading-relaxed">{body}</p>
    </Link>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="py-5 border-b border-line">
      <div className="text-base font-medium">{q}</div>
      <p className="mt-2 text-base text-text-muted leading-relaxed max-w-2xl">{a}</p>
    </div>
  );
}






