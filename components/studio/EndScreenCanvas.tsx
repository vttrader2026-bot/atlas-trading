"use client";
// END-SCREEN-v1: the end-screen image at its EXACT export size. The editor shows it scaled down; export mounts a 1:1 copy.
// All sizes scale with the shorter side (1080 = 1x) so every canvas shape keeps the same proportions.
import { forwardRef } from "react";
import { isHexColor } from "@/lib/studio";
import type { EndSpec } from "@/lib/endScreen";

const hex = (v: string, fallback: string) => (isHexColor(v) ? v : fallback);

const EndScreenCanvas = forwardRef<HTMLDivElement, { spec: EndSpec }>(function EndScreenCanvas({ spec }, ref) {
  const rtl = spec.lang === "ar";
  const u = Math.min(spec.w, spec.h) / 1080;
  const wide = spec.w / spec.h > 1.3;
  const text = hex(spec.text, "#ffffff"), accent = hex(spec.accent, "#e3a23d");
  const items = spec.align === "center" ? "center" : spec.align === "start" ? "flex-start" : "flex-end";
  return (
    <div
      ref={ref}
      dir={rtl ? "rtl" : "ltr"}
      lang={spec.lang}
      data-endscreen={`${spec.w}x${spec.h}`}
      className="relative overflow-hidden"
      style={{
        width: spec.w, height: spec.h, color: text,
        background: `linear-gradient(160deg, ${hex(spec.bg1, "#0a0d12")}, ${hex(spec.bg2, "#1b2431")})`,
        fontFamily: rtl ? "var(--font-arabic), system-ui, sans-serif" : "var(--font-heading), system-ui, sans-serif",
      }}
    >
      <div className="absolute inset-0 flex flex-col justify-center" style={{ padding: `${64 * u}px ${(wide ? 140 : 80) * u}px`, alignItems: items, textAlign: spec.align, gap: 28 * u }}>
        {spec.showLogo && (
          <div className="flex items-center" dir="ltr" style={{ gap: 14 * u, marginBottom: 12 * u }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/icon-192.png" alt="" width={Math.round(72 * u)} height={Math.round(72 * u)} style={{ borderRadius: 16 * u }} />
            <span style={{ fontSize: 44 * u, fontWeight: 700, letterSpacing: "-0.01em" }}>Atlas <span style={{ color: accent }}>TRADING</span></span>
          </div>
        )}
        <h1 style={{ fontSize: 96 * u * (spec.headScale / 100), lineHeight: 1.1, fontWeight: 800, letterSpacing: rtl ? 0 : "-0.02em", margin: 0, overflowWrap: "anywhere" }}>{spec.headline}</h1>
        {spec.subtitle && <p style={{ fontSize: 44 * u * (spec.subScale / 100), lineHeight: 1.35, margin: 0, opacity: 0.85, maxWidth: 900 * u, overflowWrap: "anywhere" }}>{spec.subtitle}</p>}
        {spec.cta && (
          <div style={{ marginTop: 16 * u, background: accent, color: hex(spec.ctaText, "#0b0e11"), borderRadius: 999, fontWeight: 700, fontSize: 46 * u * (spec.ctaScale / 100), padding: `${24 * u}px ${64 * u}px`, boxShadow: `0 ${10 * u}px ${30 * u}px rgba(0,0,0,.25)` }}>{spec.cta}</div>
        )}
      </div>
      {spec.showUrl && spec.url && (
        <div dir="ltr" className="absolute inset-x-0 text-center" style={{ bottom: 48 * u, fontSize: 36 * u, opacity: 0.8, fontFamily: "var(--font-mono), monospace" }}>{spec.url}</div>
      )}
    </div>
  );
});
export default EndScreenCanvas;
