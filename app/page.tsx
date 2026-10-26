"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTicker24h, getAllTickers24h, formatPrice, formatCompact, Ticker24h } from "@/lib/binance";
import { buildRadarRows, RadarRow } from "@/lib/radar";
import { useLanguage } from "@/lib/i18n";
import { IconRadar, IconAnalyzer, IconJournal, IconRisk } from "@/components/icons";
import type { PublishedTrade } from "@/lib/tradeFeed";
import type { RankedAsset } from "@/lib/marketIntelCompute";
import type { FearGreed, AltcoinSeason, GlobalMetrics } from "@/lib/coinmarketcap";

const HERO_PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

export default function Home() {
  const { t, lang } = useLanguage();
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
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_0_40px_-14px_color-mix(in_srgb,var(--gold)_45%,transparent)]">
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

      {/* MARKET OVERVIEW */}
      <section className="max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
        <div className="text-label text-gold">{t("marketOverview.eyebrow")}</div>
        <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight max-w-lg">
          {t("marketOverview.heading")}
        </h2>
        <p className="mt-3 text-base text-text-muted leading-relaxed max-w-xl">
          {t("marketOverview.subtitle")}
        </p>
        <div className="mt-7">
          <MarketOverview />
        </div>
      </section>

      {/* {t("pulseSection.eyebrow")} */}
      <section className="max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
        <div className="text-label text-gold">{t("pulseSection.eyebrow")}</div>
        <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight max-w-lg">
          {t("pulseSection.heading")}
        </h2>

        <div className="mt-7 border border-line rounded-xl bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-5 h-10 border-b border-line">
            <span className="text-label">{t("pulseSection.liveMarkets")}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-bull font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
              {t("pulseSection.live")}
            </span>
          </div>

          <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
            {HERO_PAIRS.map((symbol, i) => {
              const tk = tickers[symbol];
              const change = tk ? parseFloat(tk.priceChangePercent) : 0;
              const positive = change >= 0;
              const base = symbol.replace("USDT", "");
              const name = PULSE_COIN_NAMES[base] || base;
              return (
                <div
                  key={symbol}
                  className="radar-row-in group px-5 py-6 hover:bg-surface-raised/40 transition-colors duration-300"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <PulseCoinLogo base={base} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{name}</div>
                      <div className="text-xs text-text-muted font-data">{base}/USDT</div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-2">
                    <span className="font-data text-2xl sm:text-3xl font-bold tracking-tight">
                      {tk ? `$${formatPrice(tk.lastPrice)}` : "..."}
                    </span>
                    <span
                      className={`font-data text-sm font-medium flex items-center gap-1 ${
                        positive ? "text-bull" : "text-bear"
                      }`}
                    >
                      <span aria-hidden>{positive ? "▲" : "▼"}</span>
                      {tk ? `${positive ? "+" : ""}${change.toFixed(2)}%` : "--"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <Link
            href="/radar"
            className="flex items-center justify-center gap-1.5 px-5 py-3.5 border-t border-line text-sm text-text-muted hover:text-gold transition-colors"
          >
            {t("pulseSection.openRadar")}
            <span aria-hidden>{"→"}</span>
          </Link>
        </div>
      </section>

      {/* RADAR PREVIEW */}
      <section className="max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
        <div className="text-label text-gold">
          {lang === "ar" ? "رادار السوق" : "MARKET RADAR"}
        </div>
        <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight max-w-lg">
          {lang === "ar" ? "اكتشف الفرص التي تستحق المتابعة." : "Find the setups worth watching."}
        </h2>
        <p className="mt-3 text-base text-text-muted leading-relaxed max-w-xl">
          {lang === "ar"
            ? "يفحص أطلس سوق Binance ويختصر مئات أزواج USDT إلى قائمة مركّزة — ليقضي المتداولون وقتًا أقل في البحث ووقتًا أكثر في التحليل."
            : "Atlas scans the Binance market and narrows hundreds of USDT pairs into a focused shortlist — so traders spend less time searching and more time analyzing."}
        </p>
        <div className="mt-7">
          <RadarPreview />
        </div>
      </section>

      {/* ATLAS MARKET INTELLIGENCE */}
      <section className="max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
        <div className="text-label text-gold">{t("intelSection.eyebrow")}</div>
        <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight max-w-lg">
          {t("intelSection.heading")}
        </h2>
        <p className="mt-3 text-base text-text-muted leading-relaxed max-w-xl">
          {t("intelSection.body")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[10px] uppercase tracking-wide text-text-muted">
            {t("intelSection.sourcesLabel")}
          </span>
          {["Grayscale", "Coinbase 50", "World Liberty Financial", "Made in USA"].map((name, i, arr) => (
            <span key={name} className="text-xs text-text-muted">
              {name}
              {i < arr.length - 1 && <span className="mx-1.5 opacity-50" aria-hidden>·</span>}
            </span>
          ))}
        </div>
        <div className="mt-7">
          <IntelPreview />
        </div>
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
                className="rounded-2xl border border-line bg-surface p-6 shadow-[0_0_40px_-14px_color-mix(in_srgb,var(--gold)_45%,transparent)]"
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

      {/* {t("workspaceSection.eyebrow")} */}
      <section className="max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
        <div className="text-label text-gold">{t("workspaceSection.eyebrow")}</div>
        <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight max-w-lg">
          {t("workspaceSection.heading")}
        </h2>
        <p className="mt-3 text-base text-text-muted leading-relaxed max-w-xl">
          {t("workspaceSection.subtitle")}
        </p>

        <div className="mt-8 grid sm:grid-cols-3 gap-4">
          <WorkspaceToolPreview icon={<IconRisk className="w-5 h-5" />} title={t("workspaceSection.riskTitle")} href="/risk">
            <div className="space-y-2.5">
              <WorkspaceField label={t("workspaceSection.accountBalance")} />
              <WorkspaceField label={t("workspaceSection.riskPerTrade")} suffix="%" />
              <div className="pt-2 border-t border-line flex items-center justify-between">
                <span className="text-[11px] text-text-muted uppercase tracking-wide">{t("workspaceSection.positionSize")}</span>
                <span className="font-data text-xs text-text-muted">--</span>
              </div>
            </div>
          </WorkspaceToolPreview>

          <WorkspaceToolPreview icon={<IconJournal className="w-5 h-5" />} title={t("workspaceSection.journalTitle")} href="/journal">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-data text-text-muted">BTC/USDT</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-line text-text-muted">Long</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-data text-text-muted">ETH/USDT</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-line text-text-muted">Short</span>
              </div>
              <div className="pt-2 border-t border-line text-[11px] text-text-muted">
                {t("workspaceSection.journalNote")}
              </div>
            </div>
          </WorkspaceToolPreview>

          <WorkspaceToolPreview icon={<IconTradeFeed className="w-5 h-5" />} title={t("workspaceSection.tradeFeedTitle")} href="/trade-feed">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-data">BTC/USDT</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-bull/40 text-bull">Long</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-data">SOL/USDT</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-bear/40 text-bear">Short</span>
              </div>
              <div className="pt-2 border-t border-line text-[11px] text-text-muted">
                {t("workspaceSection.tradeFeedNote")}
              </div>
            </div>
          </WorkspaceToolPreview>
        </div>
      </section>

      {/* COMMUNITY */}
      <section className="max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
        <div className="text-label text-gold">{t("communitySection.eyebrow")}</div>
        <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight max-w-lg">
          {t("communitySection.heading")}
        </h2>
        <p className="mt-3 text-base text-text-muted leading-relaxed max-w-xl">
          {t("communitySection.subtitle")}
        </p>

        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <div className="group border border-line rounded-xl bg-surface p-6 hover:border-[#26A5E4]/50 transition-colors duration-300">
            <IconTelegram className="w-11 h-11" />
            <div className="mt-4 text-base font-medium">{t("communitySection.telegram")}</div>
            <p className="mt-1.5 text-sm text-text-muted leading-relaxed">
              {t("communitySection.telegramBody")}
            </p>
            <a
              href="https://t.me/atlastradingcrypto"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-5 inline-flex items-center gap-1.5"
            >
              {t("communitySection.telegramCta")}
              <span aria-hidden>{"→"}</span>
            </a>
          </div>

          <div className="group border border-line rounded-xl bg-surface p-6 hover:border-[#25D366]/50 transition-colors duration-300">
            <IconWhatsapp className="w-11 h-11" />
            <div className="mt-4 text-base font-medium">{t("communitySection.whatsapp")}</div>
            <p className="mt-1.5 text-sm text-text-muted leading-relaxed">
              {t("communitySection.whatsappBody")}
            </p>
            <a
              href="https://chat.whatsapp.com/Br0OH7mHCHv6MpTmIas2Je?mode=gi_t"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-5 inline-flex items-center gap-1.5"
            >
              {t("communitySection.whatsappCta")}
              <span aria-hidden>{"→"}</span>
            </a>
          </div>
        </div>
      </section>

      {/* {t("eliteSection.eyebrow")} */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid lg:grid-cols-2 gap-6 items-stretch">
        <div className="card p-7 sm:p-10 flex flex-col">
          <div className="text-label text-gold">{t("proSection.eyebrow")}</div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight max-w-xl">
            {t("proSection.heading")}
          </h2>
          <p className="mt-3 text-base text-text-muted leading-relaxed max-w-xl">
            {t("proSection.subtitle")}
          </p>
          <div className="mt-7 grid gap-y-2.5">
            <EliteFeature>{t("proSection.f1")}</EliteFeature>
            <EliteFeature>{t("proSection.f2")}</EliteFeature>
            <EliteFeature>{t("proSection.f3")}</EliteFeature>
            <EliteFeature>{t("proSection.f4")}</EliteFeature>
          </div>
          <div className="mt-auto pt-8 flex flex-wrap items-center gap-5">
            <div>
              <div className="text-2xl font-bold">
                {t("proSection.price")}<span className="text-sm text-text-muted font-normal">{t("proSection.perMonth")}</span>
              </div>
              <div className="text-xs text-text-muted">{t("proSection.mru")}</div>
            </div>
            <Link href="/elite?plan=analyzer" className="btn-primary inline-flex items-center gap-1.5">
              {t("proSection.cta")}
              <span aria-hidden>{"→"}</span>
            </Link>
          </div>
        </div>

        <div className="card card-accent p-7 sm:p-10 flex flex-col">
          <div className="text-label text-gold">{t("eliteSection.eyebrow")}</div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight max-w-xl">
            {t("eliteSection.heading")}
          </h2>
          <p className="mt-3 text-base text-text-muted leading-relaxed max-w-xl">
            {t("eliteSection.subtitle")}
          </p>

          <div className="mt-7 grid sm:grid-cols-2 lg:grid-cols-1 gap-x-8 gap-y-2.5">
            <EliteFeature>{t("eliteSection.f1")}</EliteFeature>
            <EliteFeature>{t("eliteSection.f2")}</EliteFeature>
            <EliteFeature>{t("eliteSection.f3")}</EliteFeature>
            <EliteFeature>{t("eliteSection.f4")}</EliteFeature>
            <EliteFeature>{t("eliteSection.f5")}</EliteFeature>
            <EliteFeature>{t("eliteSection.f6")}</EliteFeature>
            <EliteFeature>{t("eliteSection.f7")}</EliteFeature>
            <EliteFeature>{t("eliteSection.f8")}</EliteFeature>
            <EliteFeature>{t("eliteSection.f9")}</EliteFeature>
          </div>

          <div className="mt-auto pt-8 flex flex-wrap items-center gap-5">
            <div className="text-2xl font-bold">
              $14.99<span className="text-sm text-text-muted font-normal">{t("eliteSection.perMonth")}</span>
            </div>
            <Link href="/elite" className="btn-primary inline-flex items-center gap-1.5">
              {t("eliteSection.cta")}
              <span aria-hidden>{"→"}</span>
            </Link>
          </div>
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
    <Link href={href} className="group rounded-2xl border border-line bg-surface p-6 shadow-[0_0_40px_-14px_color-mix(in_srgb,var(--gold)_45%,transparent)]">
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








const RADAR_PREVIEW_SIZE = 5;
const RADAR_REFRESH_MS = 30000;
// Thin-volume pairs that spike disproportionately on noise rather than a
// real setup - excluded from the homepage preview shortlist specifically.
const PREVIEW_EXCLUDED_SYMBOLS = new Set(["CREAMUSDT", "PNTUSDT", "KDAUSDT"]);

function RadarPreview() {
  const { t, lang } = useLanguage();
  const [rows, setRows] = useState<RadarRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let isFirstLoad = true;
    async function load() {
      try {
        const [tickers, btc] = await Promise.all([getAllTickers24h(), getTicker24h("BTCUSDT")]);
        if (cancelled) return;
        const btcChange = parseFloat(btc.priceChangePercent);
        const built = buildRadarRows(tickers, btcChange);
        const shortlist = [...built]
          .filter((r) => r.tags.includes("outperformBtc") && !PREVIEW_EXCLUDED_SYMBOLS.has(r.ticker.symbol))
          .sort((a, b) => b.vsBtcPct - a.vsBtcPct)
          .slice(0, RADAR_PREVIEW_SIZE);
        setRows(shortlist);
        setFailed(false);
        if (!isFirstLoad) {
          setJustRefreshed(true);
          setTimeout(() => setJustRefreshed(false), 400);
        }
        isFirstLoad = false;
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    load();
    const id = setInterval(load, RADAR_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const conditionStyle: Record<string, string> = {
    bullish: "border-bull/40 text-bull",
    bearish: "border-bear/40 text-bear",
    range: "border-gold/40 text-gold",
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 h-11 border-b border-line">
        <span className="text-label">
          {lang === "ar" ? "الأزواج المتفوقة على BTC الآن" : "Outperforming BTC right now"}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-bull font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
          {t("pulseSection.live")}
        </span>
      </div>

      {rows === null && !failed && (
        <div className="px-5 py-10 text-center text-sm text-text-muted">
          {lang === "ar" ? "جارٍ تحميل بيانات السوق..." : "Loading market data..."}
        </div>
      )}
      {failed && rows === null && (
        <div className="px-5 py-10 text-center text-sm text-bear">
          {lang === "ar" ? "تعذر تحميل البيانات. حاول لاحقًا." : "Couldn't load market data. Try again shortly."}
        </div>
      )}
      {rows !== null && rows.length === 0 && (
        <div className="px-5 py-10 text-center text-sm text-text-muted">
          {lang === "ar" ? "لا توجد أزواج متفوقة حاليًا." : "Nothing outperforming BTC right now."}
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <div
          className={`overflow-x-auto transition-opacity duration-300 ${justRefreshed ? "opacity-70" : "opacity-100"}`}
        >
          <table className="w-full text-sm min-w-[420px]">
            <thead className="text-text-muted">
              <tr className="border-b border-line">
                <th className="text-left px-5 py-2.5 font-normal text-[11px] uppercase tracking-wide">
                  {lang === "ar" ? "الزوج" : "Pair"}
                </th>
                <th className="text-right px-5 py-2.5 font-normal text-[11px] uppercase tracking-wide">
                  {lang === "ar" ? "24 ساعة" : "24H"}
                </th>
                <th className="text-left px-5 py-2.5 font-normal text-[11px] uppercase tracking-wide">
                  {lang === "ar" ? "الإعداد" : "Setup"}
                </th>
                <th className="text-left px-5 py-2.5 font-normal text-[11px] uppercase tracking-wide">
                  {lang === "ar" ? "الحالة" : "Status"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const positive = row.change >= 0;
                return (
                  <tr
                    key={row.ticker.symbol}
                    className="radar-row-in border-t border-line hover:bg-surface-raised/50 transition-colors"
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <td className="px-5 py-3 font-data font-medium">
                      {row.ticker.symbol.replace("USDT", "/USDT")}
                    </td>
                    <td className={`px-5 py-3 text-right font-data ${positive ? "text-bull" : "text-bear"}`}>
                      {positive ? "+" : ""}
                      {row.change.toFixed(2)}%
                    </td>
                    <td className="px-5 py-3 text-text-muted">{t(`radar.setup.${row.setup}`)}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${conditionStyle[row.condition]}`}
                      >
                        {t(`radar.condition.${row.condition}`)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Link
        href="/radar"
        className="flex items-center justify-center gap-1.5 px-5 py-3.5 border-t border-line text-sm text-text-muted hover:text-gold transition-colors"
      >
        {lang === "ar" ? "عرض رادار السوق الكامل" : "View Market Radar"}
        <span aria-hidden>{"\u2192"}</span>
      </Link>
    </div>
  );
}

type OverviewSectionStatus = "ok" | "unavailable" | "not_configured";
type OverviewSection<T> = { status: OverviewSectionStatus; data: T | null };
type OverviewResponse = {
  generatedAt: string;
  devHint: boolean;
  fearGreed: OverviewSection<FearGreed>;
  altcoinSeason: OverviewSection<AltcoinSeason>;
  globalMetrics: OverviewSection<GlobalMetrics>;
  cached?: boolean;
  stale?: boolean;
  error?: string;
};

const OVERVIEW_REFRESH_MS = 5 * 60 * 1000;

function MarketOverview() {
  const { t, lang } = useLanguage();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/market-overview", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || json.error) {
          setFailed(true);
          return;
        }
        setOverview(json as OverviewResponse);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    load();
    const id = setInterval(load, OVERVIEW_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const loading = overview === null && !failed;

  return (
    <div>
      <div className="grid sm:grid-cols-3 gap-4">
        <FearGreedCard section={overview?.fearGreed ?? null} devHint={overview?.devHint ?? false} loading={loading} failed={failed} />
        <AltcoinSeasonCard section={overview?.altcoinSeason ?? null} devHint={overview?.devHint ?? false} loading={loading} failed={failed} />
        <GlobalMetricsCard section={overview?.globalMetrics ?? null} devHint={overview?.devHint ?? false} loading={loading} failed={failed} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
        <span>{t("marketOverview.source")}</span>
        {overview?.generatedAt && (
          <span>
            {overview.stale && `${t("marketOverview.stale")} · `}
            {t("marketOverview.lastUpdated")}: {new Date(overview.generatedAt).toLocaleTimeString(lang === "ar" ? "ar" : "en-US")}
          </span>
        )}
      </div>
      <p className="mt-2 text-[11px] text-text-muted max-w-xl">{t("marketOverview.disclaimer")}</p>
    </div>
  );
}

function OverviewCardShell({
  title,
  children,
  status,
  devHint,
  loading,
  failed,
}: {
  title: string;
  children: React.ReactNode;
  status: OverviewSectionStatus | undefined;
  devHint: boolean;
  loading: boolean;
  failed: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div className="card p-5 flex flex-col">
      <div className="text-xs text-text-muted uppercase tracking-wide">{title}</div>
      {(loading || failed) && (
        <div className="mt-4 flex-1 flex items-center text-sm text-text-muted">
          {failed ? t("marketOverview.unavailable") : t("marketOverview.loading")}
        </div>
      )}
      {!loading && !failed && status === "not_configured" && (
        <div className="mt-4 flex-1 flex items-center text-sm text-text-muted">
          {devHint ? t("marketOverview.notConfiguredDev") : t("marketOverview.notConfiguredProd")}
        </div>
      )}
      {!loading && !failed && status === "unavailable" && (
        <div className="mt-4 flex-1 flex items-center text-sm text-text-muted">{t("marketOverview.unavailable")}</div>
      )}
      {!loading && !failed && status === "ok" && <div className="mt-4 flex-1">{children}</div>}
    </div>
  );
}

const FEAR_GREED_LABELS: Record<string, string> = {
  "extreme fear": "fgExtremeFear",
  fear: "fgFear",
  neutral: "fgNeutral",
  greed: "fgGreed",
  "extreme greed": "fgExtremeGreed",
};

function FearGreedCard({
  section,
  devHint,
  loading,
  failed,
}: {
  section: OverviewSection<FearGreed> | null;
  devHint: boolean;
  loading: boolean;
  failed: boolean;
}) {
  const { t } = useLanguage();
  const fg = section?.data ?? null;
  const labelKey = fg?.classification ? FEAR_GREED_LABELS[fg.classification.toLowerCase()] : null;
  const label = labelKey ? t(`marketOverview.${labelKey}`) : fg?.classification;

  return (
    <OverviewCardShell title={t("marketOverview.fgTitle")} status={section?.status} devHint={devHint} loading={loading} failed={failed}>
      {fg && (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-data text-3xl font-bold">{Math.round(fg.value)}</span>
            <span className="text-xs text-text-muted">/ 100</span>
          </div>
          {label && <div className="mt-1 text-sm font-medium text-gold">{label}</div>}
          <div className="mt-3 h-1.5 rounded-full bg-surface-raised overflow-hidden">
            <div className="h-full bg-gold rounded-full" style={{ width: `${Math.max(2, Math.min(100, fg.value))}%` }} />
          </div>
          <p className="mt-3 text-xs text-text-muted leading-relaxed">{t("marketOverview.fgBody")}</p>
        </>
      )}
    </OverviewCardShell>
  );
}

function AltcoinSeasonCard({
  section,
  devHint,
  loading,
  failed,
}: {
  section: OverviewSection<AltcoinSeason> | null;
  devHint: boolean;
  loading: boolean;
  failed: boolean;
}) {
  const { t } = useLanguage();
  const alt = section?.data ?? null;
  const phaseKey = alt ? (alt.derivedPhase === "altSeason" ? "altSeason" : alt.derivedPhase === "btcSeason" ? "btcSeason" : "altMixed") : null;
  const label = alt?.apiClassification || (phaseKey ? t(`marketOverview.${phaseKey}`) : null);

  return (
    <OverviewCardShell title={t("marketOverview.altTitle")} status={section?.status} devHint={devHint} loading={loading} failed={failed}>
      {alt && (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-data text-3xl font-bold">{Math.round(alt.value)}</span>
            <span className="text-xs text-text-muted">/ 100</span>
          </div>
          {label && <div className="mt-1 text-sm font-medium text-gold">{label}</div>}
          <div className="mt-3 h-1.5 rounded-full bg-surface-raised overflow-hidden">
            <div className="h-full bg-gold rounded-full" style={{ width: `${Math.max(2, Math.min(100, alt.value))}%` }} />
          </div>
          <p className="mt-3 text-xs text-text-muted leading-relaxed">{t("marketOverview.altBody")}</p>
        </>
      )}
    </OverviewCardShell>
  );
}

function GlobalMetricsCard({
  section,
  devHint,
  loading,
  failed,
}: {
  section: OverviewSection<GlobalMetrics> | null;
  devHint: boolean;
  loading: boolean;
  failed: boolean;
}) {
  const { t } = useLanguage();
  const gm = section?.data ?? null;
  const change = gm?.totalMarketCapChange24hPct ?? null;
  const positive = (change ?? 0) >= 0;

  return (
    <OverviewCardShell title={t("marketOverview.gmTitle")} status={section?.status} devHint={devHint} loading={loading} failed={failed}>
      {gm && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">{t("marketOverview.gmMarketCap")}</span>
            <span className="font-data text-sm font-medium">${formatCompact(gm.totalMarketCapUsd)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">{t("marketOverview.gmVolume24h")}</span>
            <span className="font-data text-sm font-medium">${formatCompact(gm.totalVolume24hUsd)}</span>
          </div>
          {change !== null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">{t("marketOverview.gmChange24h")}</span>
              <span className={`font-data text-sm font-medium ${positive ? "text-bull" : "text-bear"}`}>
                {positive ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            </div>
          )}
          <div className="pt-2.5 border-t border-line flex items-center justify-between">
            <span className="text-xs text-text-muted">{t("marketOverview.gmBtcDominance")}</span>
            <span className="font-data text-sm font-medium">{gm.btcDominance.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">{t("marketOverview.gmEthDominance")}</span>
            <span className="font-data text-sm font-medium">{gm.ethDominance.toFixed(1)}%</span>
          </div>
        </div>
      )}
    </OverviewCardShell>
  );
}

const INTEL_PREVIEW_SIZE = 4;

const INTEL_CATEGORY_SHORT_EN: Record<string, string> = {
  grayscale: "Grayscale",
  coinbase50: "COIN50",
  madeInUsa: "Made in USA",
  worldLiberty: "WLFI",
};
const INTEL_CATEGORY_SHORT_AR: Record<string, string> = {
  grayscale: "جرايسكيل",
  coinbase50: "COIN50",
  madeInUsa: "صنع أمريكي",
  worldLiberty: "WLFI",
};

function IntelPreview() {
  const { t, lang } = useLanguage();
  const [assets, setAssets] = useState<RankedAsset[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Reuses the same cached Market Intelligence data endpoint the
        // dedicated page uses - no separate fetching/ranking logic here.
        const res = await fetch("/api/market-intel/data", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || json.error || !Array.isArray(json.assets)) {
          setFailed(true);
          return;
        }
        const top = [...(json.assets as RankedAsset[])]
          .sort((a, b) => a.rank - b.rank)
          .slice(0, INTEL_PREVIEW_SIZE);
        setAssets(top);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryShort = lang === "ar" ? INTEL_CATEGORY_SHORT_AR : INTEL_CATEGORY_SHORT_EN;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 h-11 border-b border-line">
        <span className="text-label">
          {lang === "ar" ? "أبرز الأصول المصنّفة" : "Top ranked assets"}
        </span>
      </div>

      {assets === null && !failed && (
        <div className="px-5 py-10 text-center text-sm text-text-muted">
          {lang === "ar" ? "جارٍ تحميل البيانات..." : "Loading market data..."}
        </div>
      )}

      {/* No fabricated numbers if the live data isn't available - a clean
          static intro instead, per the data-integrity requirement. */}
      {failed && (
        <div className="px-5 py-10 text-center text-sm text-text-muted max-w-sm mx-auto">
          {lang === "ar"
            ? "استكشف فئات الأصول المؤسسية التي يتتبعها أطلس."
            : "Explore the institutional asset categories Atlas tracks."}
        </div>
      )}

      {assets !== null && assets.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead className="text-text-muted">
              <tr className="border-b border-line">
                <th className="text-left px-5 py-2.5 font-normal text-[11px] uppercase tracking-wide">
                  {lang === "ar" ? "الأصل" : "Asset"}
                </th>
                <th className="text-left px-5 py-2.5 font-normal text-[11px] uppercase tracking-wide">
                  {lang === "ar" ? "المصدر" : "Source"}
                </th>
                <th className="text-right px-5 py-2.5 font-normal text-[11px] uppercase tracking-wide">
                  7D
                </th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a, i) => {
                const perf = a.perf7dPct;
                const positive = (perf ?? 0) >= 0;
                return (
                  <tr
                    key={a.symbol}
                    className="radar-row-in border-t border-line hover:bg-surface-raised/50 transition-colors"
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <td className="px-5 py-3 font-data font-medium">{a.symbol}</td>
                    <td className="px-5 py-3 text-text-muted text-xs">
                      {a.categories.map((c) => categoryShort[c] || c).join(" · ")}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-data ${
                        perf === null ? "text-text-muted" : positive ? "text-bull" : "text-bear"
                      }`}
                    >
                      {perf === null ? "--" : `${positive ? "+" : ""}${perf.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Link
        href="/market-intelligence"
        className="flex items-center justify-center gap-1.5 px-5 py-3.5 border-t border-line text-sm text-text-muted hover:text-gold transition-colors"
      >
        {t("intelSection.cta")}
        <span aria-hidden>{"→"}</span>
      </Link>
    </div>
  );
}

const PULSE_COIN_NAMES: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana" };
const PULSE_BADGE_COLORS: Record<string, string> = { BTC: "#F7931A", ETH: "#627EEA", SOL: "#00D4B4" };

function PulseCoinLogo({ base }: { base: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (imgFailed) {
    return (
      <span
        className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 font-data"
        style={{ backgroundColor: PULSE_BADGE_COLORS[base] || "#8A94A6" }}
      >
        {base.slice(0, 3)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`}
      alt={base}
      className="w-10 h-10 rounded-full shrink-0 bg-white object-contain p-1"
      onError={() => setImgFailed(true)}
    />
  );
}

function WorkspaceField({ label, suffix }: { label: string; suffix?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-text-muted">{label}</span>
      <span className="font-data text-xs text-text-muted border border-line rounded px-2 py-1 bg-surface-raised/40">
        --{suffix ? ` ${suffix}` : ""}
      </span>
    </div>
  );
}

function WorkspaceToolPreview({
  icon,
  title,
  href,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <Link
      href={href}
      className="group border border-line rounded-xl bg-surface overflow-hidden hover:border-gold/40 transition-colors duration-300"
    >
      <div className="flex items-center gap-2.5 px-5 h-11 border-b border-line">
        <span className="text-text-muted group-hover:text-gold transition-colors">{icon}</span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="p-5">{children}</div>
      <div className="px-5 py-3 border-t border-line text-xs text-text-muted group-hover:text-gold transition-colors flex items-center gap-1">
        {t("workspaceSection.openPrefix")} {title}
        <span aria-hidden>{"→"}</span>
      </div>
    </Link>
  );
}

function IconTradeFeed({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3v4M12 17v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="9" y="7" width="6" height="10" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 10v4M19 8v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="3" y="9" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
      <rect x="17" y="6" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
    </svg>
  );
}

function IconTelegram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="24" fill="#26A5E4" />
      <path
        fill="#fff"
        d="M35.5 14.3 10.9 23.8c-1.7.7-1.7 1.6-.3 2l6.3 2 2.4 7.4c.3.8.5 1.1 1 1.1.5 0 .8-.2 1.1-.5l3.1-3 6.4 4.7c1.2.7 2 .3 2.3-1.1l4.2-19.8c.4-1.8-.6-2.6-2-2.3zM18.9 25.5l12.7-8c.6-.4 1.2-.2.7.2L21.6 27.1l-.4 4.1-1.9-5.4z"
      />
    </svg>
  );
}

function IconWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="24" fill="#25D366" />
      <path
        fill="#fff"
        d="M24 10.5c-7.5 0-13.5 6-13.5 13.5 0 2.4.6 4.6 1.8 6.6L10 37.5l7.1-2.3c1.9 1 4.1 1.6 6.4 1.6h.1c7.5 0 13.5-6 13.5-13.5S31.5 10.5 24 10.5zm7.9 19.1c-.3.9-1.7 1.7-2.4 1.8-.6.1-1.4.1-2.3-.1-.5-.2-1.2-.4-2-.7-3.6-1.6-6-5.2-6.2-5.5-.2-.3-1.5-1.9-1.5-3.7 0-1.8.9-2.6 1.3-3 .3-.3.7-.5 1-.5h.7c.2 0 .5 0 .8.6.3.7 1 2.5 1.1 2.7.1.2.2.4 0 .7-.1.3-.2.4-.4.6-.2.2-.4.5-.6.7-.2.2-.4.5-.2.8.2.4 1 1.6 2.1 2.6 1.4 1.3 2.6 1.7 3 1.9.4.2.6.1.8-.1.2-.3.9-1 1.2-1.4.3-.4.5-.3.8-.2.3.1 2.1 1 2.5 1.2.4.2.6.3.7.5.1.2.1 1-.2 1.9z"
      />
    </svg>
  );
}

function EliteFeature({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <span className="text-gold" aria-hidden>
        {"✓"}
      </span>
      {children}
    </div>
  );
}
// ANALYZER-UPSELL-0002
