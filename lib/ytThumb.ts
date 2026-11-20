// YT-THUMB-v1: pure logic of the Social Media Studio's YouTube Thumbnail Creator (no React): size, fonts, templates, helpers.
import type { L3, Lang } from "@/lib/studio";

export const THUMB_W = 1280;
export const THUMB_H = 720;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const isAllowedImage = (f: { type: string; size: number }): boolean => (IMAGE_TYPES as readonly string[]).includes(f.type) && f.size > 0 && f.size <= MAX_IMAGE_BYTES;

export type FontId = "heading" | "sans" | "mono";
export const FONTS: Record<FontId, { name: string; css: string }> = {
  heading: { name: "Sora", css: "var(--font-heading), var(--font-sans), system-ui, sans-serif" },
  sans: { name: "Inter", css: "var(--font-sans), system-ui, sans-serif" },
  mono: { name: "JetBrains Mono", css: "var(--font-jetbrains-mono), ui-monospace, monospace" },
};
export const FONT_IDS: FontId[] = ["heading", "sans", "mono"];
export const ARABIC_FONT = "var(--font-arabic), system-ui, sans-serif";

export type Align = "start" | "center" | "end";
export type Motif = "candles" | "diamond" | "none";
export type ThumbSpec = {
  lang: Lang; headline: string; subtitle: string; tag: string;
  bg1: string; bg2: string; angle: number;
  image: string | null; imgZoom: number; imgX: number; imgY: number; // zoom percent (100-300), position percent (0-100)
  overlayColor: string; overlay: number; // overlay opacity percent 0-90
  font: FontId; headSize: number; subSize: number; headColor: string; subColor: string; accent: string; align: Align;
  outline: number; outlineColor: string; shadow: number; // outline px 0-12, shadow strength percent 0-100
  motif: Motif; showLogo: boolean; showUrl: boolean; url: string;
};
export type ThumbTemplateId = "analysis" | "bitcoin" | "ethereum" | "market" | "atlas";
export type ThumbTemplate = {
  id: ThumbTemplateId; name: L3; headline: L3; subtitle: L3; tag: L3;
  style: Pick<ThumbSpec, "bg1" | "bg2" | "angle" | "overlayColor" | "overlay" | "headColor" | "subColor" | "accent" | "outline" | "outlineColor" | "shadow" | "motif" | "headSize" | "subSize" | "font">;
};
const L = (en: string, ar: string, fr: string): L3 => ({ en, ar, fr });
const base = { overlayColor: "#000000", overlay: 0, outline: 0, outlineColor: "#000000", shadow: 40, font: "heading" as FontId, headSize: 112, subSize: 40 };

export const THUMB_TEMPLATES: ThumbTemplate[] = [
  { id: "analysis", name: L("Crypto Analysis", "تحليل العملات", "Analyse crypto"),
    headline: L("Where Is the Market Going?", "إلى أين يتجه السوق؟", "Où va le marché ?"), subtitle: L("Full technical analysis", "تحليل فني كامل", "Analyse technique complète"), tag: L("ANALYSIS", "تحليل", "ANALYSE"),
    style: { ...base, bg1: "#0a0d12", bg2: "#17222f", angle: 135, headColor: "#ffffff", subColor: "#e3a23d", accent: "#e3a23d", motif: "candles" } },
  { id: "bitcoin", name: L("Bitcoin", "بيتكوين", "Bitcoin"),
    headline: L("Bitcoin Next Move", "الخطوة القادمة لبيتكوين", "Le prochain mouvement du Bitcoin"), subtitle: L("Key levels to watch", "مستويات مهمة للمراقبة", "Niveaux clés à surveiller"), tag: L("BTC", "BTC", "BTC"),
    style: { ...base, bg1: "#1a0f02", bg2: "#7a3d00", angle: 150, headColor: "#ffffff", subColor: "#ffd08a", accent: "#f7931a", motif: "candles", shadow: 55 } },
  { id: "ethereum", name: L("Ethereum", "إيثيريوم", "Ethereum"),
    headline: L("Ethereum Breakout?", "هل ينطلق إيثيريوم؟", "Ethereum va-t-il casser ?"), subtitle: L("What traders should know", "ما يجب أن يعرفه المتداولون", "Ce que les traders doivent savoir"), tag: L("ETH", "ETH", "ETH"),
    style: { ...base, bg1: "#0b0f24", bg2: "#2b3a8f", angle: 145, headColor: "#ffffff", subColor: "#b9c6ff", accent: "#7f93f5", motif: "diamond", shadow: 55 } },
  { id: "market", name: L("Market Update", "تحديث السوق", "Point marché"),
    headline: L("Market Update", "تحديث السوق", "Point marché"), subtitle: L("What changed today", "ماذا تغيّر اليوم", "Ce qui a changé aujourd'hui"), tag: L("LIVE", "مباشر", "LIVE"),
    style: { ...base, bg1: "#06150f", bg2: "#0d3b2b", angle: 140, headColor: "#ffffff", subColor: "#7be3b4", accent: "#35c48a", motif: "candles" } },
  { id: "atlas", name: L("Atlas Trading Video", "فيديو أطلس ترايدينغ", "Vidéo Atlas Trading"),
    headline: L("Learn Crypto Trading", "تعلّم تداول العملات الرقمية", "Apprenez le trading crypto"), subtitle: L("Step-by-step on Atlas Trading", "خطوة بخطوة مع أطلس ترايدينغ", "Pas à pas avec Atlas Trading"), tag: L("TUTORIAL", "درس", "TUTO"),
    style: { ...base, bg1: "#f7c25c", bg2: "#c98f2e", angle: 160, headColor: "#0b0e11", subColor: "#2a1d05", accent: "#0b0e11", motif: "none", shadow: 0, headSize: 118 } },
];
export const templateOf = (id: ThumbTemplateId): ThumbTemplate => THUMB_TEMPLATES.find((t) => t.id === id) ?? THUMB_TEMPLATES[0];

export const clampNum = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

/** CSS text-shadow for a 0-100 strength (empty when off). */
export const shadowCss = (strength: number): string => {
  const s = clampNum(strength, 0, 100, 0);
  return s === 0 ? "none" : `0 ${Math.round(2 + s * 0.08)}px ${Math.round(6 + s * 0.3)}px rgba(0,0,0,${(0.25 + s * 0.006).toFixed(2)})`;
};

export type ImgFmt = "png" | "jpeg";
export const thumbFileName = (tpl: ThumbTemplateId, lang: Lang, fmt: ImgFmt): string => `atlas-thumbnail-${tpl}-1280x720-${lang}.${fmt === "jpeg" ? "jpg" : "png"}`;
