"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";
import { useHomeMarket, useMarketOverview, useIntelAssets, useLatestTrades } from "@/lib/useHomeData";
import HeroBoard from "@/components/home/HeroBoard";
import MarketStrip from "@/components/home/MarketStrip";
import ProductShowcase from "@/components/home/ProductShowcase";
import IntelSection from "@/components/home/IntelSection";
import ToolsSection from "@/components/home/ToolsSection";
import CommunitySection from "@/components/home/CommunitySection";
import HomeSection from "@/components/home/HomeSection";

export default function Home() {
  const { t } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const market = useHomeMarket();
  const { overview, failed: overviewFailed, loading: overviewLoading } = useMarketOverview();
  const { assets, failed: assetsFailed } = useIntelAssets();
  const trades = useLatestTrades(3);
  const signedIn = isLoaded && isSignedIn;

  return (
    <main>
      {/* 1. HERO */}
      <section className="relative">
        <div aria-hidden className="home-grid absolute inset-x-0 top-0 h-[34rem] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6 pt-16 sm:pt-24 pb-20 sm:pb-28">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-14 lg:gap-12 items-center">
            <div>
              <span className="home-rise inline-flex items-center gap-2 text-label px-3 py-1.5 rounded-full border border-line bg-surface/70">
                <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
                {t("homeV2.hero.eyebrow")}
              </span>
              <h1 className="home-rise mt-6 text-5xl sm:text-6xl lg:text-7xl leading-[1.02] tracking-tight font-bold" style={{ animationDelay: "0.08s" }}>
                {t("home.heroLine1")}
                <br />
                {t("home.heroLine2")}
                <br />
                <span className="text-gold">{t("home.heroLine3")}</span>
              </h1>
              <p className="home-rise mt-7 text-text-muted text-lg sm:text-xl max-w-lg leading-relaxed" style={{ animationDelay: "0.16s" }}>
                {t("home.heroBody")}
              </p>
              <div className="home-rise mt-10 flex flex-wrap gap-3" style={{ animationDelay: "0.24s" }}>
                <Link href="/radar" className="btn-primary !px-7 !py-3.5 text-base">{t("homeV2.hero.exploreCta")}</Link>
                {signedIn ? (
                  <Link href="/analyzer" className="btn-secondary !px-7 !py-3.5 text-base">{t("homeV2.hero.openAnalyzerCta")}</Link>
                ) : (
                  <Link href="/sign-up" className="btn-secondary !px-7 !py-3.5 text-base">{t("homeV2.hero.createCta")}</Link>
                )}
              </div>
            </div>
            <HeroBoard market={market} overview={overview} />
          </div>
        </div>
      </section>

      {/* 2. LIVE MARKET OVERVIEW */}
      <HomeSection eyebrow={t("homeV2.market.eyebrow")} heading={t("homeV2.market.heading")} subtitle={t("homeV2.market.subtitle")}>
        <MarketStrip market={market} overview={overview} overviewFailed={overviewFailed} overviewLoading={overviewLoading} />
      </HomeSection>

      {/* 3. EXPLORE ATLAS PRODUCTS */}
      <HomeSection eyebrow={t("homeV2.products.eyebrow")} heading={t("homeV2.products.heading")} subtitle={t("homeV2.products.subtitle")}>
        <ProductShowcase market={market} assets={assets} assetsFailed={assetsFailed} trades={trades} />
      </HomeSection>

      {/* 4. MARKET INTELLIGENCE */}
      <HomeSection eyebrow={t("homeV2.intel.eyebrow")} heading={t("homeV2.intel.heading")}>
        <IntelSection assets={assets} failed={assetsFailed} />
      </HomeSection>

      {/* 5. TRADING TOOLS */}
      <HomeSection eyebrow={t("homeV2.tools.eyebrow")} heading={t("homeV2.tools.heading")} subtitle={t("homeV2.tools.subtitle")}>
        <ToolsSection />
      </HomeSection>

      {/* 6. COMMUNITY & ACADEMY */}
      <HomeSection eyebrow={t("homeV2.community.eyebrow")} heading={t("homeV2.community.heading")} subtitle={t("homeV2.community.subtitle")}>
        <CommunitySection />
      </HomeSection>

      {/* MEMBERSHIP (unchanged content) */}
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

      {/* 7. FINAL CTA */}
      <section className="max-w-6xl mx-auto px-6 pb-24 sm:pb-32">
        <div className="card card-accent px-6 py-14 sm:px-14 sm:py-20 text-center home-rise">
          <div className="text-label text-gold">{t("homeV2.cta.eyebrow")}</div>
          <h2 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight max-w-3xl mx-auto">{t("homeV2.cta.heading")}</h2>
          <p className="mt-5 text-lg sm:text-xl text-text-muted max-w-xl mx-auto leading-relaxed">{t("homeV2.cta.body")}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            {signedIn ? (
              <Link href="/analyzer" className="btn-primary !px-8 !py-3.5 text-base">{t("homeV2.cta.openAnalyzer")}</Link>
            ) : (
              <Link href="/sign-up" className="btn-primary !px-8 !py-3.5 text-base">{t("homeV2.cta.create")}</Link>
            )}
            <Link href="/radar" className="btn-secondary !px-8 !py-3.5 text-base">{t("homeV2.cta.explore")}</Link>
          </div>
        </div>
      </section>
    </main>
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
// HOME-D-1100
