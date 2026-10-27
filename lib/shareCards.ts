// ATLAS SHARE — copy and geometry for the downloadable promo cards.
// Texts were checked against what each section really does and who can use
// it (Radar and Academy are public; Market Intelligence and the Analyzer need
// a free account; nothing here is Elite-only). Do not add claims about
// profits, results or accuracy.

export type CardLang = "en" | "ar";
export type CardStyle = "dark" | "light";
export type CardSection = "radar" | "analyzer" | "academy" | "marketIntel";
export type CardSize = "tiktok" | "square" | "link";

export const CARD_SECTIONS: CardSection[] = ["marketIntel", "analyzer", "radar", "academy"];

export const CARD_SIZES: Record<CardSize, { w: number; h: number; file: string }> = {
  tiktok: { w: 1080, h: 1920, file: "tiktok" },
  square: { w: 1080, h: 1080, file: "post" },
  link: { w: 1200, h: 630, file: "link" },
};

type Localized<T> = { en: T; ar: T };

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
    tag: { en: "FREE TOOL", ar: "أداة مجانية" },
    label: { en: "ATLAS RADAR", ar: "رادار أطلس" },
    headline: { en: "Which coins are near a breakout?", ar: "أي العملات قريبة من الاختراق؟" },
    sentence: {
      en: "Radar screens Binance USDT pairs with rules you can read.",
      ar: "يفحص الرادار أزواج USDT في Binance بقواعد واضحة يمكنك قراءتها.",
    },
    panel: {
      en: { title: "RULE USED", body: "Breakout = within 1% of the 24h high and up over the last 24h" },
      ar: { title: "القاعدة المستخدمة", body: "الاختراق = ضمن 1% من أعلى سعر خلال 24 ساعة ومرتفع خلال آخر 24 ساعة" },
    },
  },
  analyzer: {
    slug: "analyzer",
    tag: { en: "FREE TOOL", ar: "أداة مجانية" },
    label: { en: "ATLAS ANALYZER", ar: "محلل أطلس" },
    headline: { en: "Check a coin's trend before you trade", ar: "افحص اتجاه العملة قبل أن تتداول" },
    sentence: {
      en: "Free analyses every day with a free account. More with Analyzer Pro or Atlas Elite.",
      ar: "تحليلات مجانية كل يوم مع حساب مجاني. المزيد مع Analyzer Pro أو أطلس Elite.",
    },
  },
  academy: {
    slug: "academy",
    tag: { en: "FREE LESSONS", ar: "دروس مجانية" },
    label: { en: "ATLAS ACADEMY", ar: "أكاديمية أطلس" },
    headline: { en: "Start crypto the right way", ar: "ابدأ في الكريبتو بالطريقة الصحيحة" },
    sentence: {
      en: "Free, short lessons on crypto basics, chart reading and risk — plus a free course PDF.",
      ar: "دروس قصيرة ومجانية عن أساسيات الكريبتو وقراءة الرسوم وإدارة المخاطر — مع دورة PDF مجانية.",
    },
  },
  marketIntel: {
    slug: "market-intelligence",
    tag: { en: "FREE TOOL", ar: "أداة مجانية" },
    label: { en: "ATLAS MARKET INTELLIGENCE", ar: "ذكاء السوق من أطلس" },
    headline: { en: "Which coins are outperforming Bitcoin?", ar: "أي العملات تتفوق على البيتكوين؟" },
    sentence: {
      en: "A free research view that ranks curated crypto assets by market strength. Not trading signals.",
      ar: "عرض بحثي مجاني يرتّب أصولًا رقمية مختارة حسب قوتها في السوق. وليس إشارات تداول.",
    },
  },
};

export const CARD_FOOTER: Localized<string> = {
  en: "Educational analysis. Not financial advice.",
  ar: "تحليل تعليمي. ليس نصيحة مالية.",
};

export const CARD_ADDRESS = "atlastrading.app";

export function cardFileName(section: CardSection, size: CardSize, lang: CardLang): string {
  return `atlas-${CARD_CONTENT[section].slug}-${CARD_SIZES[size].file}-${lang}.png`;
}
// SHARE-PAGE-0105
