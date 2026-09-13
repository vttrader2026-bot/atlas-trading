"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTicker24h, formatPrice, Ticker24h } from "@/lib/binance";
import { useLanguage } from "@/lib/i18n";

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
      <section className="max-w-6xl mx-auto px-6 pt-14 pb-10">
        <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-12 items-start">
          <div>
            <h1 className="text-[2.75rem] sm:text-5xl leading-[1.08] tracking-tight max-w-lg">
              {t("home.heroTitle")}
            </h1>
            <p className="mt-5 text-text-muted text-lg max-w-md leading-relaxed">
              {t("home.heroBody")}
            </p>
            <div className="mt-8 flex gap-3">
              <Link
                href="/analyzer"
                className="px-5 py-2.5 rounded-md bg-gold text-bg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {t("home.openAnalyzer")}
              </Link>
              <Link
                href="/ticker"
                className="px-5 py-2.5 rounded-md border border-line text-sm hover:border-text-muted transition-colors"
              >
                {t("home.viewMarket")}
              </Link>
            </div>
          </div>

          <div className="border border-line rounded-lg bg-surface overflow-hidden">
            <div className="flex items-center gap-2 px-4 h-9 border-b border-line">
              <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
              <span className="text-xs text-text-muted">{t("home.liveMarket")}</span>
            </div>
            <div className="divide-y divide-line">
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
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid sm:grid-cols-3 gap-px bg-line rounded-lg overflow-hidden border border-line">
          <Feature title={t("home.features.freeTitle")} body={t("home.features.freeBody")} />
          <Feature title={t("home.features.liveTitle")} body={t("home.features.liveBody")} />
          <Feature title={t("home.features.deviceTitle")} body={t("home.features.deviceBody")} />
          <Feature title={t("home.features.aiTitle")} body={t("home.features.aiBody")} />
          <Feature title={t("home.features.pairsTitle")} body={t("home.features.pairsBody")} />
          <Feature
            title={t("home.features.communityTitle")}
            body={t("home.features.communityBody")}
          />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="border-t border-line">
          <ToolRow
            mark="AN"
            title={t("home.tools.analyzerTitle")}
            body={t("home.tools.analyzerBody")}
            href="/analyzer"
          />
          <ToolRow
            mark="JR"
            title={t("home.tools.journalTitle")}
            body={t("home.tools.journalBody")}
            href="/journal"
          />
          <ToolRow
            mark="RC"
            title={t("home.tools.riskTitle")}
            body={t("home.tools.riskBody")}
            href="/risk"
          />
        </div>
      </section>

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
              className="mt-5 inline-block px-4 py-2 rounded-md bg-gold text-bg text-sm font-medium hover:opacity-90 transition-opacity"
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
              className="mt-5 inline-block px-4 py-2 rounded-md border border-line text-sm hover:border-gold hover:text-gold transition-colors"
            >
              {t("home.community.contactVip")}
            </a>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <h2 className="text-xl tracking-tight">{t("home.faq.heading")}</h2>
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

function ToolRow({
  mark,
  title,
  body,
  href,
}: {
  mark: string;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-6 py-6 border-b border-line hover:bg-surface/40 transition-colors px-2 -mx-2 rounded-md"
    >
      <span className="font-data text-sm text-text-muted w-10 shrink-0">{mark}</span>
      <div className="flex-1">
        <div className="text-base group-hover:text-gold transition-colors">{title}</div>
        <p className="mt-1 text-sm text-text-muted leading-relaxed max-w-xl">{body}</p>
      </div>
    </Link>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-bg p-6">
      <div className="text-sm">{title}</div>
      <p className="mt-2 text-sm text-text-muted leading-relaxed">{body}</p>
    </div>
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
