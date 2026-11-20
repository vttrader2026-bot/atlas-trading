"use client";
// YT-THUMB-v1: the thumbnail at its EXACT export size (1280x720). The editor shows it scaled; export mounts a 1:1 copy.
import { forwardRef } from "react";
import { isHexColor } from "@/lib/studio";
import { ARABIC_FONT, FONTS, THUMB_H, THUMB_W, shadowCss, type ThumbSpec } from "@/lib/ytThumb";

const hex = (v: string, f: string) => (isHexColor(v) ? v : f);
const CANDLES = [[30, 50, 1], [44, 62, 1], [38, 56, 0], [58, 78, 1], [52, 72, 0], [70, 92, 1], [64, 88, 1], [84, 100, 1]] as const;

function Motif({ kind, color }: { kind: ThumbSpec["motif"]; color: string }) {
  if (kind === "none") return null;
  if (kind === "diamond")
    return (
      <svg viewBox="0 0 100 160" width={300} height={480} style={{ opacity: 0.28 }} aria-hidden>
        <polygon points="50,0 100,80 50,60" fill={color} /><polygon points="50,0 0,80 50,60" fill={color} opacity=".7" />
        <polygon points="50,160 100,92 50,72" fill={color} opacity=".9" /><polygon points="50,160 0,92 50,72" fill={color} opacity=".6" />
      </svg>
    );
  return (
    <svg viewBox="0 0 100 100" width={420} height={420} style={{ opacity: 0.3 }} aria-hidden>
      {CANDLES.map(([lo, hi, up], i) => (
        <g key={i}>
          <line x1={8 + i * 11.5} x2={8 + i * 11.5} y1={100 - hi - 6} y2={100 - lo + 6} stroke={color} strokeWidth="1.4" />
          <rect x={4.5 + i * 11.5} y={100 - hi} width="7" height={hi - lo} fill={up ? color : "none"} stroke={color} strokeWidth="1.4" rx="1" />
        </g>
      ))}
    </svg>
  );
}

const YtThumbCanvas = forwardRef<HTMLDivElement, { spec: ThumbSpec }>(function YtThumbCanvas({ spec }, ref) {
  const rtl = spec.lang === "ar";
  const accent = hex(spec.accent, "#e3a23d");
  const stroke = spec.outline > 0 ? { WebkitTextStroke: `${spec.outline}px ${hex(spec.outlineColor, "#000000")}`, paintOrder: "stroke fill" as const } : {};
  const items = spec.align === "center" ? "center" : spec.align === "start" ? "flex-start" : "flex-end";
  const font = rtl ? ARABIC_FONT : FONTS[spec.font].css;
  const textShadow = shadowCss(spec.shadow);
  const textOnRight = spec.align === "center" ? false : rtl ? spec.align === "start" : spec.align === "end";
  const motifSide = textOnRight ? "left" : "right"; // the motif sits on the physical side opposite the text
  return (
    <div
      ref={ref}
      dir={rtl ? "rtl" : "ltr"}
      lang={spec.lang}
      data-yt-thumb={`${THUMB_W}x${THUMB_H}`}
      className="relative overflow-hidden"
      style={{ width: THUMB_W, height: THUMB_H, background: `linear-gradient(${spec.angle}deg, ${hex(spec.bg1, "#0a0d12")}, ${hex(spec.bg2, "#17222f")})`, fontFamily: font }}
    >
      {spec.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={spec.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: `${spec.imgX}% ${spec.imgY}%`, transform: `scale(${spec.imgZoom / 100})`, transformOrigin: `${spec.imgX}% ${spec.imgY}%` }} />
      )}
      {spec.overlay > 0 && <div style={{ position: "absolute", inset: 0, background: hex(spec.overlayColor, "#000000"), opacity: spec.overlay / 100 }} />}
      {spec.motif !== "none" && (
        <div style={{ position: "absolute", bottom: 40, [motifSide]: 56, display: "flex" }} dir="ltr"><Motif kind={spec.motif} color={accent} /></div>
      )}
      <div style={{ position: "absolute", inset: 0, padding: "52px 64px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: items, textAlign: spec.align, gap: 22 }}>
        {spec.tag && (
          <div style={{ background: accent, color: hex(spec.headColor, "#ffffff") === "#ffffff" ? "#0b0e11" : "#ffffff", fontWeight: 800, fontSize: 30, letterSpacing: rtl ? 0 : "0.08em", padding: "6px 22px", borderRadius: 10 }}>{spec.tag}</div>
        )}
        <h1 style={{ margin: 0, maxWidth: spec.align === "center" ? 1100 : 780, fontSize: spec.headSize, lineHeight: 1.05, fontWeight: 800, letterSpacing: rtl ? 0 : "-0.02em", color: hex(spec.headColor, "#ffffff"), textShadow, overflowWrap: "anywhere", ...stroke }}>{spec.headline}</h1>
        {spec.subtitle && <p style={{ margin: 0, maxWidth: spec.align === "center" ? 1000 : 760, fontSize: spec.subSize, lineHeight: 1.25, fontWeight: 600, color: hex(spec.subColor, "#e3a23d"), textShadow, overflowWrap: "anywhere" }}>{spec.subtitle}</p>}
      </div>
      {spec.showLogo && (
        <div dir="ltr" style={{ position: "absolute", top: 32, [rtl ? "right" : "left"]: 40, display: "flex", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 10 }} />
          <span style={{ fontSize: 28, fontWeight: 700, color: hex(spec.headColor, "#ffffff"), textShadow, fontFamily: FONTS.heading.css }}>Atlas <span style={{ color: accent }}>TRADING</span></span>
        </div>
      )}
      {spec.showUrl && spec.url && (
        <div dir="ltr" style={{ position: "absolute", bottom: 28, [rtl ? "left" : "right"]: 40, fontSize: 24, fontWeight: 600, color: hex(spec.headColor, "#ffffff"), opacity: 0.85, textShadow, fontFamily: FONTS.mono.css }}>{spec.url}</div>
      )}
    </div>
  );
});
export default YtThumbCanvas;
