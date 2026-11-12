"use client";

// HERO-PHONE-v1: the homepage hero smartphone. Same CSS phone as the Investor showcase (frame, proportions, styling and
// float animation), with a compact dashboard of the whole Atlas ecosystem: market, Market Intelligence, Radar, an active
// Trade Feed signal, the AI Analyzer and Investor tracking. All DEMO data (lib/demoHero.ts): no network, no account.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "@/lib/i18n";
import { CoinLogo } from "@/components/market/MarketBits";
import { DEMO_ANALYZER, DEMO_INTEL, DEMO_MARKET, DEMO_PORTFOLIO, DEMO_RADAR, DEMO_SIGNAL, fmtPct, fmtUsd } from "@/lib/demoHero";

const SCREEN_W = 390;
const SCREEN_H = 844;

function Spark({ values, up }: { values: readonly number[]; up: boolean }) {
  const min = Math.min(...values), span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(26 - ((v - min) / span) * 22).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? "var(--bull)" : "var(--bear)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Panel({ title, tag, delay, children }: { title: string; tag?: ReactNode; delay: number; children: ReactNode }) {
  return (
    <section className="home-rise card p-3" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-label text-text-muted">{title}</h2>
        {tag}
      </div>
      {children}
    </section>
  );
}

const Coin = ({ c }: { c: typeof DEMO_MARKET.btc | typeof DEMO_MARKET.eth }) => (
  <div className="min-w-0 flex-1">
    <div className="flex items-center gap-1.5">
      <CoinLogo base={c.symbol} size={20} />
      <span className="font-data text-[13px] font-semibold">{c.symbol}</span>
      <span dir="ltr" className="ms-auto font-data text-[12px] text-bull">{fmtPct(c.changePct)}</span>
    </div>
    <div dir="ltr" className="mt-1 font-data text-[15px] font-semibold leading-tight">{fmtUsd(c.price)}</div>
    <Spark values={c.series} up={c.changePct >= 0} />
  </div>
);

export default function HeroPhone() {
  const { t } = useLanguage();
  const screenRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.74);

  // The screen is designed at a real phone width and scaled to whatever room the page gives it.
  useEffect(() => {
    const el = screenRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / SCREEN_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sg = DEMO_SIGNAL;
  const checks = DEMO_ANALYZER.checks.map((k) => ({ k, label: t({ structure: "homeApp.heroChStructure", volume: "homeApp.heroChVolume", htf: "homeApp.heroChHtf", room: "homeApp.heroChRoom" }[k]) }));

  return (
    <figure className="m-0 w-full">
      <div className="home-phone-float hero-phone-w mx-auto w-full">
        <div
          role="img"
          aria-label={t("homeApp.heroAria")}
          className="relative rounded-[2.7rem] border border-white/10 bg-[#14181f] p-[7px] shadow-[0_28px_60px_-18px_rgba(0,0,0,0.65),0_0_0_1px_rgba(245,185,66,0.12)]"
        >
          {/* side buttons */}
          <span aria-hidden className="absolute -start-[3px] top-24 h-10 w-[3px] rounded-s bg-[#14181f]" />
          <span aria-hidden className="absolute -end-[3px] top-32 h-16 w-[3px] rounded-e bg-[#14181f]" />

          <div ref={screenRef} className="relative overflow-hidden rounded-[2.1rem] bg-bg" style={{ height: SCREEN_H * scale }}>
            <div aria-hidden className="absolute top-0 left-0 origin-top-left text-text" style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${scale})` }}>
              {/* status bar + island */}
              <div className="flex items-center justify-between px-7 pt-3 text-[13px] font-semibold" dir="ltr">
                <span>9:41</span>
                <span className="absolute left-1/2 top-2.5 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-black" />
                <span className="flex items-center gap-1.5">
                  <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="4.3" y="5" width="3" height="6" rx="1" /><rect x="8.6" y="2.5" width="3" height="8.5" rx="1" /><rect x="12.9" y="0" width="3" height="11" rx="1" /></svg>
                  <svg width="24" height="11" viewBox="0 0 24 11" fill="none" stroke="currentColor"><rect x="0.5" y="0.5" width="20" height="10" rx="3" opacity="0.6" /><rect x="2" y="2" width="15" height="7" rx="1.6" fill="currentColor" stroke="none" /><rect x="22" y="3.5" width="1.6" height="4" rx="0.8" fill="currentColor" stroke="none" opacity="0.6" /></svg>
                </span>
              </div>

              <div className="px-4 pt-4">
                {/* app header */}
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/icon-192.png" alt="" width={30} height={30} className="rounded-lg border border-line" />
                  <span className="font-heading text-xl font-bold">Atlas</span>
                  <span className="ms-auto rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">{t("homeApp.demoBadge")}</span>
                </div>

                <div className="mt-3 space-y-2">
                  {/* BTC / ETH */}
                  <section className="home-rise card flex gap-4 p-3" style={{ animationDelay: "80ms" }}>
                    <Coin c={DEMO_MARKET.btc} />
                    <span aria-hidden className="w-px bg-line" />
                    <Coin c={DEMO_MARKET.eth} />
                  </section>

                  {/* Market Intelligence */}
                  <Panel title={t("nav.marketIntel")} delay={160}>
                    <div className="flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between text-[12px]">
                          <span className="text-text-muted">{t("homeApp.heroFearGreed")}</span>
                          <span dir="ltr" className="font-data font-semibold text-bull">{DEMO_INTEL.fearGreed} · {t("homeApp.heroGreed")}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised" dir="ltr">
                          <span className="block h-full rounded-full bg-gold" style={{ width: `${DEMO_INTEL.fearGreed}%` }} />
                        </div>
                      </div>
                      <div className="text-end text-[12px]">
                        <div className="text-text-muted">{t("homeApp.heroDominance")}</div>
                        <div dir="ltr" className="font-data font-semibold">{DEMO_INTEL.btcDominancePct}%</div>
                      </div>
                    </div>
                  </Panel>

                  {/* Radar */}
                  <Panel title={`${t("nav.radar")} · ${t("homeApp.heroBeatBtc")}`} delay={240}>
                    <ul className="divide-y divide-line">
                      {DEMO_RADAR.map((r) => (
                        <li key={r.symbol} className="flex items-center gap-2.5 py-1.5 first:pt-0 last:pb-0">
                          <CoinLogo base={r.symbol} size={22} />
                          <span className="font-data text-[13px] font-medium">{r.symbol}</span>
                          <span dir="ltr" className="ms-auto font-data text-[13px] text-bull">{fmtPct(r.vsBtcPct)}</span>
                        </li>
                      ))}
                    </ul>
                  </Panel>

                  {/* Trade Feed: an active spot LONG signal */}
                  <Panel
                    title={t("nav.tradeFeed")}
                    delay={320}
                    tag={<span className="inline-flex items-center gap-1 text-[11px] font-semibold text-bull"><span className="h-1.5 w-1.5 rounded-full bg-bull" />{t("homeApp.heroActive")}</span>}
                  >
                    <div className="flex items-center gap-2">
                      <CoinLogo base="SOL" size={22} />
                      <span dir="ltr" className="font-data text-[14px] font-semibold">{sg.pair}</span>
                      <span dir="ltr" className="font-data text-[11px] text-text-muted">{sg.timeframe}</span>
                      <span className="ms-auto rounded-md bg-bull/15 px-1.5 py-0.5 text-[11px] font-semibold text-bull">{t("homeApp.heroSpotLong")}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 text-[12px]" dir="ltr">
                      <div className="col-span-2"><dt className="text-text-muted">{t("homeApp.heroEntry")}</dt><dd className="font-data font-medium">{sg.entryLow} – {sg.entryHigh}</dd></div>
                      <div><dt className="text-text-muted">{t("homeApp.heroStop")}</dt><dd className="font-data font-medium text-bear">{sg.stop}</dd></div>
                      <div><dt className="text-text-muted">TP1</dt><dd className="font-data font-medium text-bull">{sg.tp1}</dd></div>
                      <div><dt className="text-text-muted">TP2</dt><dd className="font-data font-medium text-bull">{sg.tp2}</dd></div>
                      <div><dt className="text-text-muted">TP3</dt><dd className="font-data font-medium text-bull">{sg.tp3}</dd></div>
                    </dl>
                  </Panel>

                  {/* AI Analyzer preview */}
                  <Panel title={t("nav.analyzer")} delay={400} tag={<span dir="ltr" className="font-data text-[11px] text-text-muted">{DEMO_ANALYZER.pair} · {DEMO_ANALYZER.timeframe}</span>}>
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-bull">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5" /><path d="M5 8.2l2.1 2.1L11 6.2" /></svg>
                      {t("homeApp.heroValid")}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1">
                      {checks.map((c) => (
                        <li key={c.k} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-raised px-1.5 py-0.5 text-[11px] text-text-muted">
                          <span className="text-bull" aria-hidden>✓</span>{c.label}
                        </li>
                      ))}
                    </ul>
                  </Panel>

                  {/* Investor tracking */}
                  <section className="home-rise card flex items-center gap-3 p-3" style={{ animationDelay: "480ms" }}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-label text-text-muted">{t("nav.investor")} · {t("investor.value")}</span>
                      <span dir="ltr" className="mt-0.5 block font-data text-[16px] font-semibold leading-tight">{fmtUsd(DEMO_PORTFOLIO.valueUsdt)}</span>
                    </span>
                    <span className="text-end">
                      <span className="block text-label text-text-muted">{t("investor.roi")}</span>
                      <span dir="ltr" className="mt-0.5 block font-data text-[16px] font-semibold leading-tight text-bull">{fmtPct(DEMO_PORTFOLIO.roiPct)}</span>
                    </span>
                  </section>
                </div>
              </div>

              <span className="absolute bottom-2 left-1/2 h-1 w-28 -translate-x-1/2 rounded-full bg-text/40" />
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-xs leading-relaxed text-text-muted" dir="auto">{t("homeApp.heroNote")}</figcaption>
    </figure>
  );
}
