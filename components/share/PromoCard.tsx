"use client";

import { forwardRef, type CSSProperties, type ReactNode } from "react";
import Logo from "@/components/Logo";
import {
  CARD_ADDRESS,
  CARD_CONTENT,
  CARD_FOOTER,
  CARD_SIZES,
  type CardLang,
  type CardSection,
  type CardSize,
  type CardStyle,
} from "@/lib/shareCards";

// Fixed-pixel promo card. Everything is inline-styled with literal colours so
// the card never depends on the site's light/dark theme or on Tailwind
// breakpoints — what you preview is exactly what gets exported.

const THEMES = {
  dark: { bg: "#0a0d12", text: "#f2f4f7", muted: "#a3adbb", line: "#26303c", accent: "#e3a23d", glow: true },
  light: { bg: "#eceff4", text: "#111827", muted: "#4b5563", line: "#cbd3de", accent: "#b8842f", glow: false },
} as const;

type Metrics = {
  pad: number;
  logo: number; // scale applied to the shared <Logo/>
  tag: number;
  label: number;
  headline: number;
  sentence: number;
  panel: number;
  gap: number;
  footer: number;
};

const METRICS: Record<CardSize, Metrics> = {
  tiktok: { pad: 96, logo: 3.2, tag: 30, label: 36, headline: 108, sentence: 46, panel: 38, gap: 40, footer: 32 },
  square: { pad: 80, logo: 2.6, tag: 26, label: 30, headline: 84, sentence: 38, panel: 32, gap: 32, footer: 28 },
  link: { pad: 56, logo: 1.9, tag: 20, label: 22, headline: 56, sentence: 26, panel: 21, gap: 20, footer: 20 },
};

/** Keeps digits and % in left-to-right runs inside Arabic text. */
function bidi(text: string, lang: CardLang): ReactNode {
  if (lang !== "ar") return text;
  const parts = text.split(/(\d+%?)/g);
  return parts.map((p, i) =>
    /^\d/.test(p) ? (
      <span key={i} dir="ltr" style={{ unicodeBidi: "isolate", display: "inline-block" }}>
        {p}
      </span>
    ) : (
      p
    )
  );
}

const PromoCard = forwardRef<
  HTMLDivElement,
  { section: CardSection; lang: CardLang; style: CardStyle; size: CardSize }
>(function PromoCard({ section, lang, style, size }, ref) {
  const c = CARD_CONTENT[section];
  const th = THEMES[style];
  const m = METRICS[size];
  const { w, h } = CARD_SIZES[size];
  const isAr = lang === "ar";
  const panel = c.panel?.[lang];

  const bodyFont = isAr
    ? "var(--font-arabic), 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif"
    : "var(--font-sans), system-ui, sans-serif";
  const headFont = isAr
    ? bodyFont
    : "var(--font-heading-family), var(--font-sans), system-ui, sans-serif";

  const root: CSSProperties & Record<string, string | number> = {
    width: w,
    height: h,
    boxSizing: "border-box",
    padding: m.pad,
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    background: th.bg,
    backgroundImage: th.glow
      ? `radial-gradient(ellipse 80% 45% at 50% -10%, ${th.accent}2e, transparent 65%)`
      : "none",
    color: th.text,
    direction: isAr ? "rtl" : "ltr",
    textAlign: "start",
    fontFamily: bodyFont,
    // The shared <Logo/> reads var(--gold); pin it so the mark is on-brand
    // in both card styles regardless of the site theme.
    "--gold": th.accent,
  };

  return (
    <div ref={ref} style={root} lang={lang}>
      {/* TOP: logo + tag */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div dir="ltr" style={{ height: 28 * m.logo, display: "flex", alignItems: "center" }}>
          <div style={{ transform: `scale(${m.logo})`, transformOrigin: isAr ? "right center" : "left center", color: th.text }}>
            <Logo />
          </div>
        </div>
        <div
          style={{
            border: `${Math.max(2, m.tag / 10)}px solid ${th.accent}`,
            color: th.accent,
            borderRadius: 999,
            padding: `${m.tag * 0.35}px ${m.tag * 0.8}px`,
            fontSize: m.tag,
            fontWeight: 700,
            letterSpacing: isAr ? 0 : m.tag * 0.08,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {c.tag[lang]}
        </div>
      </div>

      {/* MIDDLE */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: m.gap }}>
        <div
          style={{
            color: th.accent,
            fontSize: m.label,
            fontWeight: 700,
            letterSpacing: isAr ? 0 : m.label * 0.12,
            lineHeight: 1.2,
          }}
        >
          {c.label[lang]}
        </div>
        <div
          style={{
            fontFamily: headFont,
            fontSize: m.headline,
            fontWeight: 800,
            lineHeight: isAr ? 1.35 : 1.1,
            letterSpacing: isAr ? 0 : -m.headline * 0.015,
          }}
        >
          {c.headline[lang]}
        </div>
        <div style={{ color: th.muted, fontSize: m.sentence, lineHeight: isAr ? 1.7 : 1.45, fontWeight: 500 }}>
          {c.sentence[lang]}
        </div>
        {panel && (
          <div
            style={{
              border: `${Math.max(2, m.panel / 14)}px solid ${th.accent}66`,
              background: `${th.accent}1a`,
              borderRadius: m.panel * 0.5,
              padding: `${m.panel * 0.6}px ${m.panel * 0.8}px`,
            }}
          >
            <div
              style={{
                color: th.accent,
                fontSize: m.panel * 0.72,
                fontWeight: 700,
                letterSpacing: isAr ? 0 : m.panel * 0.1,
                lineHeight: 1.2,
              }}
            >
              {panel.title}
            </div>
            <div style={{ marginTop: m.panel * 0.3, fontSize: m.panel, fontWeight: 600, lineHeight: isAr ? 1.6 : 1.35 }}>
              {bidi(panel.body, lang)}
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM: address + disclaimer (always shown) */}
      <div style={{ flexShrink: 0, borderTop: `2px solid ${th.line}`, paddingTop: m.footer * 0.8 }}>
        <div
          dir="ltr"
          style={{
            unicodeBidi: "isolate",
            textAlign: isAr ? "right" : "left",
            fontSize: m.footer * 1.15,
            fontWeight: 700,
            color: th.text,
            letterSpacing: "0.01em",
            fontFamily: "var(--font-sans), system-ui, sans-serif",
          }}
        >
          {CARD_ADDRESS}
        </div>
        <div style={{ marginTop: m.footer * 0.3, fontSize: m.footer, color: th.muted, lineHeight: isAr ? 1.6 : 1.3 }}>
          {CARD_FOOTER[lang]}
        </div>
      </div>
    </div>
  );
});

export default PromoCard;
