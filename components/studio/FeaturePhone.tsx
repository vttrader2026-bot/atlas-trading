"use client";
// SOCIAL-STUDIO-v1: a feature screen in the SAME virtual iPhone frame as the homepage / Investor phones (same bezel,
// radius, buttons, 390x844 screen scaled to its width). It shows only the feature's real name and factual capability
// lines (lib/studio.ts) - no numbers, prices or results.
import { useEffect, useRef, useState } from "react";
import { featureOf, type FeatureId, type Lang } from "@/lib/studio";

const SCREEN_W = 390;
const SCREEN_H = 844;

export default function FeaturePhone({ feature, lang }: { feature: FeatureId; lang: Lang }) {
  const f = featureOf(feature);
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.74);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / SCREEN_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rtl = lang === "ar";
  return (
    <div className="relative w-full rounded-[2.7rem] border border-white/10 bg-[#14181f] p-[7px] shadow-[0_28px_60px_-18px_rgba(0,0,0,0.65),0_0_0_1px_rgba(245,185,66,0.12)]">
      <span aria-hidden className="absolute -start-[3px] top-24 h-10 w-[3px] rounded-s bg-[#14181f]" />
      <span aria-hidden className="absolute -end-[3px] top-32 h-16 w-[3px] rounded-e bg-[#14181f]" />
      <div ref={ref} className="relative overflow-hidden rounded-[2.1rem] bg-bg" style={{ height: SCREEN_H * scale }}>
        <div aria-hidden className="absolute top-0 left-0 origin-top-left text-text" dir={rtl ? "rtl" : "ltr"} style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${scale})` }}>
          <div className="flex items-center justify-between px-7 pt-3 text-[13px] font-semibold" dir="ltr">
            <span>9:41</span>
            <span className="absolute left-1/2 top-2.5 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-black" />
            <span className="text-[11px] tracking-wide opacity-70">●●●</span>
          </div>
          <div className="px-4 pt-5">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/icon-192.png" alt="" width={30} height={30} className="rounded-lg border border-line" />
              <span className="font-heading text-xl font-bold">Atlas</span>
            </div>
            <h2 className="mt-7 font-heading text-[30px] font-bold leading-tight text-gold" dir="auto">{f.name[lang]}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-text-muted" dir="auto">{f.headline[lang]}</p>
            <ul className="mt-7 space-y-3">
              {f.bullets.map((b, i) => (
                <li key={i} className="card flex items-center gap-3 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 font-data text-sm font-semibold text-gold" dir="ltr">{i + 1}</span>
                  <span className="text-[15px] font-medium leading-snug" dir="auto">{b[lang]}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-xl border border-gold/40 bg-gold/10 py-3 text-center text-sm font-semibold text-gold" dir="ltr">atlastrading.app</div>
          </div>
        </div>
      </div>
    </div>
  );
}
