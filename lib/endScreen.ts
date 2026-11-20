// END-SCREEN-v1: pure logic of the Social Media Studio's End Screen Creator (no React): canvas sizes, templates, helpers.
import type { L3, Lang } from "@/lib/studio";

export type SizeId = "story" | "wide" | "square" | "portrait" | "custom";
export const END_SIZES: Record<Exclude<SizeId, "custom">, { w: number; h: number; ratio: string }> = {
  story: { w: 1080, h: 1920, ratio: "9:16" },
  wide: { w: 1920, h: 1080, ratio: "16:9" },
  square: { w: 1080, h: 1080, ratio: "1:1" },
  portrait: { w: 1080, h: 1350, ratio: "4:5" },
};
export const SIZE_IDS: SizeId[] = ["story", "wide", "square", "portrait", "custom"];
export const MIN_DIM = 200;
export const MAX_DIM = 4096;

/** Whole pixels inside [MIN_DIM, MAX_DIM]; anything unusable falls back to `fallback`. */
export function clampDim(v: unknown, fallback = 1080): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(n)));
}

export function sizeOf(id: SizeId, custom: { w: number; h: number }): { w: number; h: number } {
  return id === "custom" ? { w: clampDim(custom.w), h: clampDim(custom.h) } : { w: END_SIZES[id].w, h: END_SIZES[id].h };
}

export type Align = "start" | "center" | "end";
export type EndSpec = {
  w: number; h: number; lang: Lang; headline: string; subtitle: string; cta: string; url: string; showLogo: boolean; showUrl: boolean;
  bg1: string; bg2: string; text: string; accent: string; ctaText: string; align: Align;
  headScale: number; subScale: number; ctaScale: number; // percent of the default size (50-200)
};
export type EndTemplateId = "watch" | "visit" | "follow" | "join";
export type EndTemplate = { id: EndTemplateId; name: L3; headline: L3; subtitle: L3; cta: L3; colors: Pick<EndSpec, "bg1" | "bg2" | "text" | "accent" | "ctaText"> };
const L = (en: string, ar: string, fr: string): L3 => ({ en, ar, fr });

export const END_TEMPLATES: EndTemplate[] = [
  { id: "watch", name: L("Watch the Full Video", "شاهد الفيديو كاملاً", "Regardez la vidéo complète"),
    headline: L("Watch the Full Video", "شاهد الفيديو كاملاً", "Regardez la vidéo complète"),
    subtitle: L("The full breakdown is on our website.", "الشرح الكامل متاح على موقعنا.", "L'analyse complète est sur notre site."),
    cta: L("Watch now", "شاهد الآن", "Regarder"),
    colors: { bg1: "#0a0d12", bg2: "#1b2431", text: "#f2f4f7", accent: "#e3a23d", ctaText: "#0b0e11" } },
  { id: "visit", name: L("Visit Atlas Trading", "زر أطلس ترايدينغ", "Visitez Atlas Trading"),
    headline: L("Visit Atlas Trading", "زر أطلس ترايدينغ", "Visitez Atlas Trading"),
    subtitle: L("AI-powered analysis, trade planning and risk management in one platform.", "تحليل مدعوم بالذكاء الاصطناعي وتخطيط الصفقات وإدارة المخاطر في منصة واحدة.", "Analyse par IA, planification des trades et gestion du risque sur une seule plateforme."),
    cta: L("Open the website", "افتح الموقع", "Ouvrir le site"),
    colors: { bg1: "#f7c25c", bg2: "#c98f2e", text: "#0b0e11", accent: "#0b0e11", ctaText: "#ffffff" } },
  { id: "follow", name: L("Follow for More", "تابعنا للمزيد", "Suivez-nous"),
    headline: L("Follow for More", "تابعنا للمزيد", "Suivez-nous pour plus"),
    subtitle: L("New crypto tutorials and market analysis every week.", "دروس جديدة عن العملات الرقمية وتحليلات السوق كل أسبوع.", "De nouveaux tutoriels crypto et analyses de marché chaque semaine."),
    cta: L("Follow Atlas", "تابع أطلس", "Suivre Atlas"),
    colors: { bg1: "#10151c", bg2: "#0a0d12", text: "#ffffff", accent: "#35c48a", ctaText: "#0b0e11" } },
  { id: "join", name: L("Create a Free Account", "أنشئ حساباً مجانياً", "Créez un compte gratuit"),
    headline: L("Create a Free Account", "أنشئ حساباً مجانياً", "Créez un compte gratuit"),
    subtitle: L("Start exploring the Atlas tools today.", "ابدأ باستكشاف أدوات أطلس اليوم.", "Découvrez dès aujourd'hui les outils Atlas."),
    cta: L("Get started", "ابدأ الآن", "Commencer"),
    colors: { bg1: "#f5f7fb", bg2: "#e4eaf3", text: "#111827", accent: "#b8842f", ctaText: "#ffffff" } },
];
export const templateOf = (id: EndTemplateId): EndTemplate => END_TEMPLATES.find((t) => t.id === id) ?? END_TEMPLATES[0];

export const clampScale = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(200, Math.max(50, Math.round(n))) : 100;
};

export type ImgFmt = "png" | "jpeg";
export const endFileName = (tpl: EndTemplateId, w: number, h: number, lang: Lang, fmt: ImgFmt): string =>
  `atlas-endscreen-${tpl}-${w}x${h}-${lang}.${fmt === "jpeg" ? "jpg" : "png"}`;
