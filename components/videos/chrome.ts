// VIDEOS-v1: page strings live here (like the Academy) so lib/i18n.tsx stays untouched.
import type { Lang } from "@/lib/videos";

export const CHROME = {
  title: { en: "Atlas Videos", ar: "فيديوهات أطلس", fr: "Vidéos Atlas" },
  subtitle: {
    en: "Tutorials, market analysis and platform updates from ATLAS TRADING, streamed from our YouTube channel.",
    ar: "دروس وتحليلات للسوق وتحديثات المنصة من ATLAS TRADING، تُعرض من قناتنا على يوتيوب.",
    fr: "Tutoriels, analyses de marché et actualités de la plateforme ATLAS TRADING, diffusés depuis notre chaîne YouTube.",
  },
  homeEyebrow: { en: "VIDEO LIBRARY", ar: "مكتبة الفيديو", fr: "BIBLIOTHÈQUE VIDÉO" },
  homeTitle: { en: "Watch Atlas Videos", ar: "شاهد فيديوهات أطلس", fr: "Regardez les vidéos Atlas" },
  homeBody: {
    en: "Watch crypto tutorials, platform guides, market analysis and educational content from the Atlas Trading team, straight from our video library.",
    ar: "شاهد دروس العملات الرقمية وأدلة استخدام المنصة وتحليلات السوق والمحتوى التعليمي من فريق ATLAS TRADING، مباشرة من مكتبة الفيديو.",
    fr: "Regardez des tutoriels crypto, des guides de la plateforme, des analyses de marché et des contenus pédagogiques de l'équipe Atlas Trading, directement depuis notre bibliothèque vidéo.",
  },
  homeCta: { en: "Watch All Videos", ar: "مشاهدة جميع الفيديوهات", fr: "Voir toutes les vidéos" },
  isNew: { en: "New", ar: "جديد", fr: "Nouveau" },
  newVideos: { en: "New videos", ar: "فيديوهات جديدة", fr: "Nouvelles vidéos" },
  newVideo: { en: "New video", ar: "فيديو جديد", fr: "Nouvelle vidéo" },
  bellOne: { en: "1 new video", ar: "فيديو جديد واحد", fr: "1 nouvelle vidéo" },
  bellMany: { en: "{n} new videos", ar: "{n} فيديوهات جديدة", fr: "{n} nouvelles vidéos" },
  all: { en: "All videos", ar: "كل الفيديوهات", fr: "Toutes les vidéos" },
  latest: { en: "Latest", ar: "الأحدث", fr: "Dernière vidéo" },
  empty: { en: "New videos are on the way.", ar: "فيديوهات جديدة قادمة قريبًا.", fr: "De nouvelles vidéos arrivent bientôt." },
  emptyBody: {
    en: "Meanwhile, the Academy has short written lessons you can start with today.",
    ar: "في الأثناء، تجد في الأكاديمية دروسًا مكتوبة قصيرة يمكنك البدء بها اليوم.",
    fr: "En attendant, l'Académie propose de courtes leçons écrites pour commencer dès aujourd'hui.",
  },
  toAcademy: { en: "Go to the Academy", ar: "اذهب إلى الأكاديمية", fr: "Aller à l'Académie" },
  play: { en: "Play video", ar: "تشغيل الفيديو", fr: "Lire la vidéo" },
  playNamed: { en: "Play: {title}", ar: "تشغيل: {title}", fr: "Lire : {title}" },
  watchOnYoutube: { en: "Watch on YouTube", ar: "شاهد على يوتيوب", fr: "Regarder sur YouTube" },
  share: { en: "Share", ar: "مشاركة", fr: "Partager" },
  linkCopied: { en: "Link copied", ar: "تم نسخ الرابط", fr: "Lien copié" },
  related: { en: "More videos", ar: "المزيد من الفيديوهات", fr: "Autres vidéos" },
  back: { en: "Videos", ar: "الفيديوهات", fr: "Vidéos" },
  academyCardTitle: { en: "Watch Atlas videos", ar: "شاهد فيديوهات أطلس", fr: "Regardez les vidéos Atlas" },
  academyCardBody: {
    en: "Tutorials, market analysis and platform updates, straight from our YouTube channel.",
    ar: "دروس وتحليلات للسوق وتحديثات المنصة، مباشرة من قناتنا على يوتيوب.",
    fr: "Tutoriels, analyses de marché et actualités de la plateforme, directement depuis notre chaîne YouTube.",
  },
  academyCardCta: { en: "Open the video library", ar: "افتح مكتبة الفيديو", fr: "Ouvrir la vidéothèque" },
  disclaimer: {
    en: "Educational content only. Not financial advice.",
    ar: "محتوى تعليمي فقط. ليست نصيحة مالية.",
    fr: "Contenu éducatif uniquement. Ceci n'est pas un conseil financier.",
  },
} as const;

const LOCALES: Record<Lang, string> = { en: "en-GB", ar: "ar", fr: "fr-FR" };

/** "2026-11-18" -> "18 Nov 2026" in the visitor's language. Fixed to UTC so it never shifts a day. */
export function formatVideoDate(date: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  } catch {
    return date;
  }
}
