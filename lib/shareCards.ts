// ATLAS SHARE — copy and geometry for the downloadable promo cards.
// Texts were checked against what each section really does and who can use
// it (Radar and Academy are public; Market Intelligence and the Analyzer need
// a free account; nothing here is Elite-only). Do not add claims about
// profits, results or accuracy.

export type CardLang = "en" | "ar" | "fr";
export type CardStyle = "dark" | "light";
export type CardSection = "radar" | "analyzer" | "academy" | "marketIntel";
export type CardSize = "tiktok" | "square" | "link";

export const CARD_SECTIONS: CardSection[] = ["marketIntel", "analyzer", "radar", "academy"];

export const CARD_SIZES: Record<CardSize, { w: number; h: number; file: string }> = {
  tiktok: { w: 1080, h: 1920, file: "tiktok" },
  square: { w: 1080, h: 1080, file: "post" },
  link: { w: 1200, h: 630, file: "link" },
};

type Localized<T> = { en: T; ar: T; fr: T };

export const CARD_CONTENT: Record<
  CardSection,
  {
    slug: string;
    tag: Localized<string>;
    label: Localized<string>;
    headline: Localized<string>;
    sentence: Localized<string>;
    panel?: Localized<{ title: string; body: string }>;
  }
> = {
  radar: {
    slug: "radar",
    tag: { en: "FREE TOOL", ar: "أداة مجانية", fr: "OUTIL GRATUIT" },
    label: { en: "ATLAS RADAR", ar: "رادار أطلس", fr: "RADAR ATLAS" },
    headline: { en: "Which coins are near a breakout?", ar: "أي العملات قريبة من الاختراق؟", fr: "Quelles cryptos sont proches d'une cassure ?" },
    sentence: {
      en: "Radar screens Binance USDT pairs with rules you can read.",
      ar: "يفحص الرادار أزواج USDT في Binance بقواعد واضحة يمكنك قراءتها.",
      fr: "Le Radar analyse les paires USDT de Binance avec des règles lisibles.",
    },
    panel: {
      en: { title: "RULE USED", body: "Breakout = within 1% of the 24h high and up over the last 24h" },
      ar: { title: "القاعدة المستخدمة", body: "الاختراق = ضمن 1% من أعلى سعر خلال 24 ساعة ومرتفع خلال آخر 24 ساعة" },
      fr: { title: "RÈGLE UTILISÉE", body: "Cassure = à moins de 1 % du plus haut 24 h et en hausse sur les dernières 24 h" },
    },
  },
  analyzer: {
    slug: "analyzer",
    tag: { en: "FREE TOOL", ar: "أداة مجانية", fr: "OUTIL GRATUIT" },
    label: { en: "ATLAS ANALYZER", ar: "محلل أطلس", fr: "ANALYSEUR ATLAS" },
    headline: { en: "Check a coin's trend before you trade", ar: "افحص اتجاه العملة قبل أن تتداول", fr: "Vérifiez la tendance d'une crypto avant de trader" },
    sentence: {
      en: "Free analyses every day with a free account. More with Analyzer Pro or Atlas Elite.",
      ar: "تحليلات مجانية كل يوم مع حساب مجاني. المزيد مع Analyzer Pro أو أطلس Elite.",
      fr: "Des analyses gratuites chaque jour avec un compte gratuit. Davantage avec Analyzer Pro ou Atlas Elite.",
    },
  },
  academy: {
    slug: "academy",
    tag: { en: "FREE LESSONS", ar: "دروس مجانية", fr: "LEÇONS GRATUITES" },
    label: { en: "ATLAS ACADEMY", ar: "أكاديمية أطلس", fr: "ACADÉMIE ATLAS" },
    headline: { en: "Start crypto the right way", ar: "ابدأ في الكريبتو بالطريقة الصحيحة", fr: "Débutez dans la crypto du bon pied" },
    sentence: {
      en: "Free, short lessons on crypto basics, chart reading and risk — plus a free course PDF.",
      ar: "دروس قصيرة ومجانية عن أساسيات الكريبتو وقراءة الرسوم وإدارة المخاطر — مع دورة PDF مجانية.",
      fr: "Des leçons courtes et gratuites sur les bases de la crypto, la lecture des graphiques et le risque — plus un cours en PDF gratuit.",
    },
  },
  marketIntel: {
    slug: "market-intelligence",
    tag: { en: "FREE TOOL", ar: "أداة مجانية", fr: "OUTIL GRATUIT" },
    label: { en: "ATLAS MARKET INTELLIGENCE", ar: "ذكاء السوق من أطلس", fr: "ATLAS MARKET INTELLIGENCE" },
    headline: { en: "Which coins are outperforming Bitcoin?", ar: "أي العملات تتفوق على البيتكوين؟", fr: "Quelles cryptos surperforment le Bitcoin ?" },
    sentence: {
      en: "A free research view that ranks curated crypto assets by market strength. Not trading signals.",
      ar: "عرض بحثي مجاني يرتّب أصولًا رقمية مختارة حسب قوتها في السوق. وليس إشارات تداول.",
      fr: "Une vue de recherche gratuite qui classe des actifs crypto sélectionnés selon leur force de marché. Ce ne sont pas des signaux de trading.",
    },
  },
};

export const CARD_FOOTER: Localized<string> = {
  en: "Educational analysis. Not financial advice.",
  ar: "تحليل تعليمي. ليس نصيحة مالية.",
  fr: "Analyse éducative. Ne constitue pas un conseil financier.",
};

export const CARD_ADDRESS = "atlastrading.app";

export function cardFileName(section: CardSection, size: CardSize, lang: CardLang): string {
  return `atlas-${CARD_CONTENT[section].slug}-${CARD_SIZES[size].file}-${lang}.png`;
}
// SHARE-PAGE-0105
// SHARE-FR-1740
