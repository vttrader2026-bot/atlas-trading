// WHATSAPP-BOT-v1: free, fixed-answer WhatsApp support bot (no AI, no paid API). Pure logic only: no I/O.
// Every fact below comes from the site itself (lib/entitlementConfig.ts and the Free/ELITE copy in lib/i18n.tsx).
import { createHmac, timingSafeEqual } from "node:crypto";
import { ELITE_PRICE, ELITE_PERIOD_DAYS, PLAN_LIMITS } from "@/lib/entitlementConfig";

export type Lang = "en" | "ar" | "fr";
export type Intent = "menu" | "elite" | "free" | "payment" | "analyzer" | "feed" | "academy" | "community" | "human";

const SITE = "https://www.atlastrading.app";

/** Hex HMAC-SHA256 of the exact raw body, compared in constant time. */
export function verifySignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret || typeof signature !== "string" || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "utf8");
  const got = Buffer.from(signature.trim(), "utf8");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function detectLang(text: string): Lang {
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/[àâçéèêëîïôûùüœ]|\b(bonjour|salut|bonsoir|prix|abonnement|combien|merci|comment|gratuit|je|vous|quel|quelle|signaux)\b/i.test(text)) return "fr";
  return "en";
}

const norm = (s: string) => s.toLowerCase().replace(/[ً-ٟـ]/g, "").replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();

// Order matters: first match wins. An explicit request for the owner comes first, then the specific topics, then generic "help"
// words (which only show the menu). A bare digit answers the numbered menu: 6 = the owner, 8 = Academy.
const RULES: Array<[Intent, RegExp]> = [
  ["human", /\b(human|agent|owner|admin|real person|(speak|talk) (to|with) (a |the |an )?(person|someone|somebody))\b|humain|conseiller|propriétaire|proprietaire|parler (à|a|avec) (quelqu|une personne|un humain|le )|موظف|اتكلم|التحدث|بشري|(?<![؀-ۿ])(?:ال)?(?:مالك|صاحب|شخص)(?![؀-ۿ])|(?<![؀-ۿ])[وف]?كلم(?:ني|ون)?(?![؀-ۿ])/],
  ["payment", /\b(pay|payment|usdt|bankily|masrivi|sedad|bank|transfer|how to join)\b|paiement|payer|virement|دفع|ادفع|بنكيلي|مصرفي|سداد|تحويل/],
  ["elite", /\b(elite|price|cost|how much|subscribe|subscription|vip|premium|upgrade|plan)\b|prix|tarif|abonnement|combien|سعر|اشتراك|(?<![؀-ۿ])[وبف]?كم(?![؀-ۿ])|النخبه|ايليت|عضويه|ترقيه/],
  ["analyzer", /\b(analy[sz]er|analysis|analyses|chart|ai|limit)\b|analyse|graphique|تحليل|شارت|الذكاء/],
  ["feed", /\b(signal|signals|trade feed|feed|tp1|tp2|tp3|stop.?loss|spot)\b|signaux|إشارات|اشارات|اشاره|توصيات|توصيه|صفقات/],
  ["academy", /\b(academy|course|learn|lesson|education)\b|académie|academie|cours|apprendre|اكاديميه|دوره|تعلم|تعليم/],
  ["community", /\b(telegram|community|group|whatsapp group)\b|communauté|communaute|groupe|تيليجرام|تلجرام|مجتمع|مجموعه|قروب/],
  ["free", /\b(free|sign ?up|register|account|join)\b|gratuit|inscription|compte|مجاني|مجانا|تسجيل|حساب|انضم/],
  ["menu", /^(hi|hello|hey|start|menu|help|salam|salut|bonjour|bonsoir|مرحبا|اهلا|سلام|السلام عليكم|هلا|قائمه)\b|\b(help me|support|assistance)\b|aide|مساعده|دعم|^[?؟!.]*$/],
];
const DIGITS: Record<string, Intent> = { "1": "elite", "2": "free", "3": "payment", "4": "analyzer", "5": "feed", "6": "human", "7": "community", "8": "academy" };

// A message made only of greeting words ("السلام عليكم", "مرحبا بكم", "bonjour", "good morning") is a first hello: it shows the menu.
// Checked before the topic rules because Arabic greetings contain "كم" ("عليكم", "بكم"), which also means "how much".
const GREETING = /^(?:(?:hi|hello|hey|salam|salut|bonjour|bonsoir|coucou|slm|good|morning|evening|afternoon|welcome|مرحبا|مرحبتين|اهلا|اهلين|سلام|السلام|عليكم|بكم|وسهلا|سهلا|ورحمه|الله|والله|وبركاته|صباح|مساء|الخير|النور|هلا|حياك|حياكم|يا|اخي|اخوي|استاذ|غالي)(?=[\s!.,،؟?]|$)[\s!.,،؟?]*)+$/;

export function matchIntent(text: string): Intent | null {
  const t = norm(text);
  if (!t) return null;
  if (DIGITS[t]) return DIGITS[t];
  if (GREETING.test(t)) return "menu";
  for (const [intent, re] of RULES) if (re.test(t)) return intent;
  return null;
}

const f = PLAN_LIMITS.free, e = PLAN_LIMITS.elite;
const price = ELITE_PRICE.usdLabel, mru = ELITE_PRICE.mru, days = ELITE_PERIOD_DAYS;

const T: Record<Intent, Record<Lang, string>> = {
  menu: {
    en: `Welcome to ATLAS TRADING 👋\nReply with a number:\n1 - ATLAS ELITE (price & benefits)\n2 - Free account\n3 - How to pay\n4 - AI chart analysis\n5 - Trade Feed & signals\n6 - Talk to the owner\n7 - Community\n8 - Academy\n\n${SITE}`,
    ar: `أهلاً بك في ATLAS TRADING 👋\nأرسل رقماً:\n1 - ATLAS ELITE (السعر والمزايا)\n2 - الحساب المجاني\n3 - طريقة الدفع\n4 - تحليل الشارت بالذكاء الاصطناعي\n5 - Trade Feed والإشارات\n6 - التحدث مع المالك\n7 - المجتمع\n8 - الأكاديمية\n\n${SITE}`,
    fr: `Bienvenue sur ATLAS TRADING 👋\nRépondez par un numéro :\n1 - ATLAS ELITE (prix et avantages)\n2 - Compte gratuit\n3 - Comment payer\n4 - Analyse IA de graphique\n5 - Trade Feed et signaux\n6 - Parler au propriétaire\n7 - Communauté\n8 - Académie\n\n${SITE}`,
  },
  elite: {
    en: `ATLAS ELITE: $${price} (${mru} MRU) for ${days} days.\nIncludes private spot signals, exclusive Elite market updates, TP1/TP2/TP3 and stop-loss updates, full trade management, up to ${e.analyzerPerDay} AI analyses a day, a watchlist of up to ${e.watchlistItems} coins, a private Telegram group and exclusive Atlas Bot alerts.\nJoin: ${SITE}/elite\nSend 3 to see how to pay.`,
    ar: `ATLAS ELITE: ${price}$ (${mru} أوقية) لمدة ${days} يوماً.\nيشمل إشارات سبوت خاصة، تحديثات Elite حصرية للسوق، تحديثات TP1/TP2/TP3 ووقف الخسارة، إدارة كاملة للصفقات، حتى ${e.analyzerPerDay} تحليلاً بالذكاء الاصطناعي يومياً، قائمة مراقبة حتى ${e.watchlistItems} عملة، مجموعة تيليجرام خاصة وتنبيهات Atlas Bot الحصرية.\nللاشتراك: ${SITE}/elite\nأرسل 3 لمعرفة طريقة الدفع.`,
    fr: `ATLAS ELITE : ${price} $ (${mru} MRU) pour ${days} jours.\nInclut les signaux spot privés, les mises à jour Elite exclusives, les mises à jour TP1/TP2/TP3 et stop-loss, la gestion complète des trades, jusqu'à ${e.analyzerPerDay} analyses IA par jour, une watchlist de ${e.watchlistItems} cryptos, un groupe Telegram privé et des alertes Atlas Bot exclusives.\nRejoindre : ${SITE}/elite\nEnvoyez 3 pour savoir comment payer.`,
  },
  free: {
    en: `A free account needs no card and has no trial period. It includes the Radar, Institutional Radar, the Academy and its course, the risk calculator, the Trade Feed and ${f.analyzerPerDay} AI chart analyses a day.\nSign up: ${SITE}/sign-up`,
    ar: `الحساب المجاني بلا بطاقة وبلا فترة تجريبية. يشمل الرادار وInstitutional Radar والأكاديمية ودورتها وحاسبة المخاطر وTrade Feed و${f.analyzerPerDay} تحليلات للشارت بالذكاء الاصطناعي يومياً.\nالتسجيل: ${SITE}/sign-up`,
    fr: `Un compte gratuit ne demande aucune carte et n'a pas de période d'essai. Il inclut le Radar, Institutional Radar, l'Académie et son cours, le calculateur de risque, le Trade Feed et ${f.analyzerPerDay} analyses IA de graphique par jour.\nInscription : ${SITE}/sign-up`,
  },
  payment: {
    en: `To join ATLAS ELITE ($${price} / ${mru} MRU, ${days} days): open ${SITE}/elite, choose a payment method (USDT, Bankily, Masrivi or Sedad), pay, then upload your payment screenshot with your Telegram username. Atlas reviews it and activates your membership.`,
    ar: `للاشتراك في ATLAS ELITE (${price}$ / ${mru} أوقية، ${days} يوماً): افتح ${SITE}/elite واختر طريقة الدفع (USDT أو Bankily أو Masrivi أو Sedad)، ادفع، ثم ارفع صورة الدفع مع اسم مستخدم تيليجرام. يراجعها Atlas ثم يفعّل عضويتك.`,
    fr: `Pour rejoindre ATLAS ELITE (${price} $ / ${mru} MRU, ${days} jours) : ouvrez ${SITE}/elite, choisissez un moyen de paiement (USDT, Bankily, Masrivi ou Sedad), payez, puis envoyez la capture du paiement avec votre nom d'utilisateur Telegram. Atlas la vérifie puis active votre abonnement.`,
  },
  analyzer: {
    en: `The AI Analyzer checks your chart against real Binance candles. Free: ${f.analyzerPerDay} analyses a day. ELITE: ${e.analyzerPerDay} a day. Limits reset at midnight UTC. An account is required.\n${SITE}/analyzer\nNot financial advice.`,
    ar: `محلل الذكاء الاصطناعي يتحقق من الشارت مقابل شموع Binance الحقيقية. المجاني: ${f.analyzerPerDay} تحليلات يومياً. ELITE: ${e.analyzerPerDay} يومياً. تتجدد الحدود عند منتصف الليل بتوقيت UTC. يلزم حساب.\n${SITE}/analyzer\nليست نصيحة مالية.`,
    fr: `L'Analyseur IA vérifie votre graphique avec les vraies bougies Binance. Gratuit : ${f.analyzerPerDay} analyses par jour. ELITE : ${e.analyzerPerDay} par jour. Réinitialisation à minuit UTC. Un compte est requis.\n${SITE}/analyzer\nCeci n'est pas un conseil financier.`,
  },
  feed: {
    en: `The Trade Feed is free to read. ATLAS ELITE adds private spot signals, TP1/TP2/TP3 and stop-loss updates and full trade management.\n${SITE}/trade-feed\nSignals are not financial advice.`,
    ar: `Trade Feed مجاني للقراءة. يضيف ATLAS ELITE إشارات سبوت خاصة وتحديثات TP1/TP2/TP3 ووقف الخسارة وإدارة كاملة للصفقات.\n${SITE}/trade-feed\nالإشارات ليست نصيحة مالية.`,
    fr: `Le Trade Feed se lit gratuitement. ATLAS ELITE ajoute les signaux spot privés, les mises à jour TP1/TP2/TP3 et stop-loss et la gestion complète des trades.\n${SITE}/trade-feed\nLes signaux ne sont pas un conseil financier.`,
  },
  academy: {
    en: `The Atlas Academy teaches the craft step by step. Its course is part of the free account, and the Academy has its own separate plan from ELITE.\n${SITE}/academy`,
    ar: `أكاديمية Atlas تعلّم الصنعة خطوة بخطوة. دورتها ضمن الحساب المجاني، وللأكاديمية خطة منفصلة عن ELITE.\n${SITE}/academy`,
    fr: `L'Académie Atlas enseigne le métier pas à pas. Son cours est inclus dans le compte gratuit, et l'Académie a son propre plan, distinct d'ELITE.\n${SITE}/academy`,
  },
  community: {
    en: `Our free communities on Telegram and WhatsApp share market updates, learning and live discussion, with a weekly educational video session every Sunday. Find the join links in the community section of ${SITE}`,
    ar: `مجتمعاتنا المجانية على تيليجرام وواتساب تشارك تحديثات السوق والتعلم والنقاش المباشر، مع جلسة فيديو تعليمية أسبوعية كل يوم أحد. تجد روابط الانضمام في قسم المجتمع على ${SITE}`,
    fr: `Nos communautés gratuites sur Telegram et WhatsApp partagent actualités du marché, apprentissage et discussions en direct, avec une session vidéo éducative chaque dimanche. Les liens se trouvent dans la section communauté de ${SITE}`,
  },
  human: {
    en: "Thanks! The owner will reply to you here personally as soon as possible.",
    ar: "شكراً! سيردّ عليك المالك شخصياً هنا في أقرب وقت.",
    fr: "Merci ! Le propriétaire vous répondra personnellement ici dès que possible.",
  },
};

export function replyFor(intent: Intent, lang: Lang): string {
  return T[intent][lang];
}

/** Lets a digit-only message ("1", "6") keep the language the customer used before. */
export function langFor(text: string, pref?: Lang | null): Lang {
  const l = detectLang(text);
  return l === "en" && pref && !/[a-z]/i.test(text) ? pref : l;
}

/** What to send for an incoming text. Text that matches nothing shows the main menu; only an explicit request for the owner is a handoff. */
export function decide(text: string, pref?: Lang | null): { reply: string; handoff: boolean } {
  const lang = langFor(text, pref);
  const intent = matchIntent(text) ?? "menu";
  return { reply: replyFor(intent, lang), handoff: intent === "human" };
}

/** Sent after a photo, voice note, video or document. Exact English wording first, then Arabic and French. */
export const MEDIA_PROMPT = {
  en: "I received your attachment, but I currently handle text messages only.\nPlease choose:\n1 - Return to the main menu\n2 - Talk to the owner personally",
  ar: "استلمت مرفقك، لكنني أتعامل حالياً مع الرسائل النصية فقط.\nاختر من فضلك:\n1 - العودة إلى القائمة الرئيسية\n2 - التحدث مع المالك شخصياً",
  fr: "J'ai bien reçu votre pièce jointe, mais je ne traite actuellement que les messages texte.\nChoisissez :\n1 - Retour au menu principal\n2 - Parler personnellement au propriétaire",
};
export const mediaPromptText = (): string => `${MEDIA_PROMPT.en}\n\n${MEDIA_PROMPT.ar}\n\n${MEDIA_PROMPT.fr}`;

/** The customer's answer to the media prompt: 1 = menu, 2 = the owner. Anything else is handled as a normal message. */
export function answerToMediaPrompt(text: string): "menu" | "human" | null {
  const t = norm(text);
  return t === "1" ? "menu" : t === "2" ? "human" : null;
}

/** The owner types this from Kapso to hand a chat back to the bot. */
export function isResumeCommand(text: string | null): boolean {
  return typeof text === "string" && /^\/bot$/i.test(text.trim());
}

type Rec = {
  phone_number_id?: unknown;
  conversation?: { phone_number_id?: unknown; phone_number?: unknown; business_scoped_user_id?: unknown };
  message?: { id?: unknown; from?: unknown; to?: unknown; from_user_id?: unknown; type?: unknown; text?: { body?: unknown }; kapso?: { direction?: unknown; origin?: unknown } };
};
export type Kind = "text" | "media" | "other";
export type Incoming = { messageId: string; to: { phone: string } | { bsuid: string }; senderKey: string; keys: string[]; text: string | null; kind: Kind; phoneNumberId: string | null };

const MEDIA_TYPES = new Set(["image", "audio", "voice", "video", "document", "sticker"]);
const idKey = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return /^\+?[\d\s-]+$/.test(t) ? t.replace(/\D/g, "") : t;
};
const uniq = (a: Array<string | null>): string[] => [...new Set(a.filter((x): x is string => !!x))];

/** Pulls the fields we need from one whatsapp.message.received payload. Returns null for anything that is not a customer message (and for reactions). */
export function parseIncoming(p: unknown): Incoming | null {
  const o = p as Rec | null;
  const m = o?.message;
  if (!m || typeof m.id !== "string") return null;
  const id: string = m.id;
  if (m.kapso?.direction && m.kapso.direction !== "inbound") return null;
  if (m.type === "reaction") return null;
  const phone = typeof m.from === "string" && m.from ? m.from : null;
  const bsuid = typeof m.from_user_id === "string" && m.from_user_id ? m.from_user_id : null;
  if (!phone && !bsuid) return null;
  const isText = m.type === "text" && typeof m.text?.body === "string";
  const kind: Kind = isText ? "text" : typeof m.type === "string" && MEDIA_TYPES.has(m.type) ? "media" : "other";
  const text = isText ? (m.text!.body as string) : null;
  const pn = o?.phone_number_id ?? o?.conversation?.phone_number_id;
  const keys = uniq([idKey(phone), idKey(bsuid), idKey(o?.conversation?.phone_number), idKey(o?.conversation?.business_scoped_user_id)]);
  return { messageId: id, to: phone ? { phone } : { bsuid: bsuid! }, senderKey: phone ?? bsuid!, keys, text, kind, phoneNumberId: typeof pn === "string" ? pn : null };
}

export type Outgoing = { messageId: string; keys: string[]; text: string | null; origin: string | null };

/** Pulls one whatsapp.message.sent payload (a message that left our number). Returns null for anything that is not outbound. */
export function parseOutbound(p: unknown): Outgoing | null {
  const o = p as Rec | null;
  const m = o?.message;
  if (!m || typeof m.id !== "string") return null;
  if (m.kapso?.direction !== "outbound") return null;
  const keys = uniq([idKey(m.to), idKey(o?.conversation?.phone_number), idKey(o?.conversation?.business_scoped_user_id)]);
  if (!keys.length) return null;
  const text = m.type === "text" && typeof m.text?.body === "string" ? m.text.body : null;
  return { messageId: m.id, keys, text, origin: typeof m.kapso?.origin === "string" ? m.kapso.origin : null };
}
