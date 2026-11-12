"use client";

// HOME-PHONE-v1: homepage smartphone showcase of Atlas Investor. A CSS phone frame (no screenshot) around a 390px-wide
// mobile screen that is scaled to fit. The screen reuses the real Investor pieces: summarize(), the money formatters,
// the Dashboard's Stat card and colours, and CoinLogo. Everything shown is DEMO data (lib/demoInvestor.ts): no account
// data, no network calls, no storage.
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { summarize } from "@/lib/investor/calc";
import { formatMoney, formatSignedMoney } from "@/lib/investor/currency";
import { DEMO_DOC, DEMO_MRU_RATE, DEMO_PRICES } from "@/lib/demoInvestor";
import { COLORS, Stat } from "@/components/investor/Dashboard";
import { fill, pct, signedPct, tone } from "@/components/investor/fmt";
import { CoinLogo } from "@/components/market/MarketBits";

const SCREEN_W = 390;
const SCREEN_H = 844;
// Compact value size so the six numbers read on one line each on a phone screen.
const VAL = "!text-[15px] !leading-tight";
const SUMMARY = summarize(DEMO_DOC, DEMO_PRICES);
const money = (n: number) => formatMoney(n, "MRU", DEMO_MRU_RATE);
const signed = (n: number) => formatSignedMoney(n, "MRU", DEMO_MRU_RATE);

export default function InvestorPhone() {
  const { t } = useLanguage();
  const s = SUMMARY;
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

  return (
    <figure className="m-0 w-full">
      <div className="home-phone-float mx-auto w-full max-w-[300px]">
        <div
          role="img"
          aria-label={t("homeApp.phoneAria")}
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

              <div className="px-4 pt-5">
                {/* app header */}
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/icon-192.png" alt="" width={30} height={30} className="rounded-lg border border-line" />
                  <span className="font-heading text-xl font-bold">{t("investor.title")}</span>
                  <span className="ms-auto rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">{t("homeApp.demoBadge")}</span>
                </div>

                {/* currency selector (MRU selected) */}
                <div className="mt-3.5 flex items-center gap-3 text-sm">
                  <span className="text-xs text-text-muted">{t("investor.currencyLabel")}</span>
                  <div className="inline-flex overflow-hidden rounded-lg border border-line">
                    <span className="px-3 py-1.5 text-xs font-semibold text-text-muted">{t("investor.currencyUsdt")}</span>
                    <span className="bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold">{t("investor.currencyMru")}</span>
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-text-muted" dir="auto">{fill(t("homeApp.demoRate"), { rate: DEMO_MRU_RATE })}</p>

                {/* the six headline numbers */}
                <div className="home-rise mt-3 grid grid-cols-2 gap-2.5" style={{ animationDelay: "120ms" }}>
                  <Stat label={t("investor.invested")} value={money(s.invested)} cls={VAL} />
                  <Stat label={t("investor.value")} value={money(s.value)} cls={VAL} />
                  <Stat label={t("investor.unrealized")} value={signed(s.unrealized)} cls={`${tone(s.unrealized)} ${VAL}`} />
                  <Stat label={t("investor.roi")} value={signedPct(s.roiPct)} cls={`${tone(s.roiPct)} ${VAL}`} />
                  <Stat label={t("investor.realized")} value={signed(s.realized)} cls={`${tone(s.realized)} ${VAL}`} />
                  <Stat label={t("investor.cash")} value={money(s.cash)} cls={VAL} />
                </div>

                {/* allocation */}
                <section className="home-rise card mt-2.5 p-3.5" style={{ animationDelay: "240ms" }}>
                  <h2 className="text-label text-text-muted">{t("investor.allocation")}</h2>
                  <div className="mt-2.5 flex h-3 w-full overflow-hidden rounded-full bg-surface-raised" dir="ltr">
                    {s.holdings.map((h, i) => (h.allocationPct ? <span key={h.asset} style={{ width: `${h.allocationPct}%`, background: COLORS[i % COLORS.length] }} /> : null))}
                  </div>
                  <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    {s.holdings.map((h, i) => (
                      <li key={h.asset} className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="font-data">{h.asset}</span>
                        <span dir="ltr" className="text-text-muted">{pct(h.allocationPct)}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* holdings */}
                <section className="home-rise card mt-2.5 p-0" style={{ animationDelay: "360ms" }}>
                  <ul className="divide-y divide-line">
                    {s.holdings.map((h) => (
                      <li key={h.asset} className="flex items-center gap-2.5 px-3.5 py-2">
                        <CoinLogo base={h.asset} size={26} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium leading-tight">{h.name}</span>
                          <span dir="ltr" className="block font-data text-[11px] leading-tight text-text-muted">{h.asset}</span>
                        </span>
                        <span className="text-end">
                          <span dir="ltr" className="block font-data text-[13px] leading-tight">{h.value === null ? "—" : money(h.value)}</span>
                          <span dir="ltr" className={`block font-data text-[11px] leading-tight ${tone(h.roiPct)}`}>{signedPct(h.roiPct)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <span className="absolute bottom-2 left-1/2 h-1 w-28 -translate-x-1/2 rounded-full bg-text/40" />
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-xs leading-relaxed text-text-muted" dir="auto">{t("homeApp.demoNote")}</figcaption>
    </figure>
  );
}
