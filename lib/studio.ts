// SOCIAL-STUDIO-v1: pure logic of the Share page's Social Media Studio (no React): formats, feature templates and their
// factual default copy, phone screens, the layout engine and small helpers. Nothing here invents statistics or results.
export type Lang = "en" | "ar" | "fr";
export type L3 = { en: string; ar: string; fr: string };

export type FormatId = "story" | "square" | "portrait" | "landscape";
type Box = { x: number; y: number; w: number; h: number };
export type Format = { id: FormatId; w: number; h: number; ratio: string; use: L3; text: Box; phones: Box; headPx: number; descPx: number };

export const FORMATS: Record<FormatId, Format> = {
  story: { id: "story", w: 1080, h: 1920, ratio: "9:16", use: { en: "TikTok · Reels · Stories", ar: "تيك توك · ريلز · ستوري", fr: "TikTok · Reels · Stories" }, text: { x: 60, y: 80, w: 960, h: 560 }, phones: { x: 40, y: 660, w: 1000, h: 1130 }, headPx: 84, descPx: 38 },
  square: { id: "square", w: 1080, h: 1080, ratio: "1:1", use: { en: "Square post", ar: "منشور مربع", fr: "Publication carrée" }, text: { x: 60, y: 36, w: 960, h: 330 }, phones: { x: 40, y: 376, w: 1000, h: 610 }, headPx: 56, descPx: 28 },
  portrait: { id: "portrait", w: 1080, h: 1350, ratio: "4:5", use: { en: "Instagram portrait", ar: "إنستغرام عمودي", fr: "Instagram portrait" }, text: { x: 60, y: 48, w: 960, h: 370 }, phones: { x: 40, y: 428, w: 1000, h: 822 }, headPx: 64, descPx: 30 },
  landscape: { id: "landscape", w: 1200, h: 628, ratio: "1.91:1", use: { en: "Facebook landscape", ar: "فيسبوك أفقي", fr: "Facebook paysage" }, text: { x: 56, y: 56, w: 500, h: 450 }, phones: { x: 590, y: 22, w: 590, h: 584 }, headPx: 52, descPx: 25 },
};
export const FORMAT_IDS: FormatId[] = ["story", "square", "portrait", "landscape"];

export type FeatureId = "overview" | "analyzer" | "radar" | "pulse" | "feed" | "journal" | "binance" | "dca" | "investor" | "academy" | "updates";
export type ScreenId = "home" | "investor" | `f:${FeatureId}`;
export type Feature = { id: FeatureId; name: L3; headline: L3; desc: L3; bullets: [L3, L3, L3]; phones: ScreenId[] };

const L = (en: string, ar: string, fr: string): L3 => ({ en, ar, fr });

export const FEATURES: Feature[] = [
  { id: "overview", name: L("Platform overview", "نظرة عامة", "Vue d'ensemble"),
    headline: L("Your crypto trading toolkit, in one place", "أدوات تداول العملات الرقمية في مكان واحد", "Votre boîte à outils crypto, au même endroit"),
    desc: L("Analyzer, Radar, Market Pulse, Trade Feed, Journal and Investor on one platform.", "المحلل والرادار ونبض السوق وخلاصة الصفقات والمفكرة والمستثمر في منصة واحدة.", "Analyseur, Radar, Market Pulse, Fil de trades, Journal et Investisseur sur une seule plateforme."),
    bullets: [L("AI chart Analyzer", "محلل الشارت بالذكاء الاصطناعي", "Analyseur de graphiques IA"), L("Radar and Market Pulse", "الرادار ونبض السوق", "Radar et Market Pulse"), L("Trade Feed, Journal, Investor", "الصفقات والمفكرة والمستثمر", "Fil de trades, Journal, Investisseur")], phones: ["home", "investor"] },
  { id: "analyzer", name: L("AI Analyzer", "المحلل الذكي", "Analyseur IA"),
    headline: L("Analyze a chart in seconds", "حلّل الشارت في ثوانٍ", "Analysez un graphique en quelques secondes"),
    desc: L("Upload a chart screenshot and get a structured AI analysis. Educational, not financial advice.", "ارفع لقطة شاشة للشارت واحصل على تحليل منظم بالذكاء الاصطناعي. للتعلّم وليس نصيحة مالية.", "Importez une capture de graphique et obtenez une analyse IA structurée. Éducatif, pas un conseil financier."),
    bullets: [L("Upload a chart screenshot", "ارفع لقطة شاشة للشارت", "Importez une capture du graphique"), L("Get a structured analysis", "احصل على تحليل منظم", "Obtenez une analyse structurée"), L("Plan your trade before you act", "خطّط لصفقتك قبل التنفيذ", "Planifiez votre trade avant d'agir")], phones: ["f:analyzer", "home"] },
  { id: "radar", name: L("Market Radar", "رادار السوق", "Radar du marché"),
    headline: L("Spot what is moving on Binance Spot", "اكتشف ما يتحرك في سوق بينانس الفوري", "Repérez ce qui bouge sur Binance Spot"),
    desc: L("Atlas Radar scans spot pairs for breakouts and strength versus BTC, and shortlists coins worth watching.", "يفحص رادار أطلس أزواج السبوت بحثًا عن الاختراقات والقوة مقابل البيتكوين ويقترح عملات تستحق المتابعة.", "Le Radar Atlas analyse les paires spot : cassures, force relative face au BTC et liste de cryptos à surveiller."),
    bullets: [L("Breakouts and pullbacks", "الاختراقات والارتدادات", "Cassures et repliements"), L("Strength versus BTC", "القوة مقابل البيتكوين", "Force relative face au BTC"), L("Worth Watching shortlist", "قائمة تستحق المتابعة", "Liste à surveiller")], phones: ["home", "f:radar"] },
  { id: "pulse", name: L("Market Pulse", "نبض السوق", "Market Pulse"),
    headline: L("Read the market mood at a glance", "اقرأ مزاج السوق بنظرة واحدة", "Lisez l'humeur du marché d'un coup d'œil"),
    desc: L("Market Pulse brings the Fear & Greed reading and BTC dominance together with the wider market picture.", "يجمع نبض السوق مؤشر الخوف والطمع وهيمنة البيتكوين مع الصورة العامة للسوق.", "Market Pulse réunit l'indice Fear & Greed, la dominance du BTC et la vue d'ensemble du marché."),
    bullets: [L("Fear & Greed reading", "مؤشر الخوف والطمع", "Indice Fear & Greed"), L("BTC dominance", "هيمنة البيتكوين", "Dominance du BTC"), L("Market groups and trends", "مجموعات السوق والاتجاهات", "Groupes de marché et tendances")], phones: ["f:pulse", "home"] },
  { id: "feed", name: L("Trade Feed", "خلاصة الصفقات", "Fil de trades"),
    headline: L("Follow every signal, from entry to exit", "تابع كل إشارة من الدخول حتى الخروج", "Suivez chaque signal, de l'entrée à la sortie"),
    desc: L("The Trade Feed publishes signals with entry zone, stop and targets, and updates them as TP and SL levels are hit.", "تنشر الخلاصة الإشارات بمنطقة الدخول والوقف والأهداف وتحدّثها عند تحقق مستويات الأهداف ووقف الخسارة.", "Le Fil de trades publie des signaux avec zone d'entrée, stop et objectifs, mis à jour quand les niveaux TP et SL sont atteints."),
    bullets: [L("Entry zone, stop and targets", "منطقة الدخول والوقف والأهداف", "Zone d'entrée, stop et objectifs"), L("TP and SL updates", "تحديثات الأهداف ووقف الخسارة", "Mises à jour TP et SL"), L("Private spot signals with Elite", "إشارات سبوت خاصة مع Elite", "Signaux spot privés avec Elite")], phones: ["f:feed", "home"] },
  { id: "journal", name: L("Trade Plans & Journal", "خطط الصفقات والمفكرة", "Plans de trade et Journal"),
    headline: L("Plan it. Record it. Learn from it.", "خطّط. سجّل. تعلّم.", "Planifiez. Enregistrez. Progressez."),
    desc: L("Build a trade plan, then track entries, fees, partial exits and realized and unrealized P&L in your Journal.", "أنشئ خطة صفقة ثم تتبّع الدخول والرسوم والخروج الجزئي والربح المحقق وغير المحقق في مفكرتك.", "Créez un plan de trade, puis suivez entrées, frais, sorties partielles et P&L réalisé et latent dans votre Journal."),
    bullets: [L("Trade plan with entry, stop, targets", "خطة بالدخول والوقف والأهداف", "Plan avec entrée, stop, objectifs"), L("Fees and partial exits", "الرسوم والخروج الجزئي", "Frais et sorties partielles"), L("Realized and unrealized P&L", "الربح المحقق وغير المحقق", "P&L réalisé et latent")], phones: ["f:journal", "home"] },
  { id: "binance", name: L("Binance Spot workflow", "سير عمل بينانس سبوت", "Workflow Binance Spot"),
    headline: L("Plan on Atlas. Execute on Binance Spot.", "خطّط في أطلس. نفّذ في بينانس سبوت.", "Planifiez sur Atlas. Exécutez sur Binance Spot."),
    desc: L("Atlas never places orders for you. You review the plan, then place the order yourself on Binance Spot.", "لا ينفّذ أطلس أي أوامر نيابةً عنك. تراجع الخطة ثم تضع الأمر بنفسك في بينانس سبوت.", "Atlas ne passe jamais d'ordres à votre place. Vous vérifiez le plan puis passez l'ordre vous-même sur Binance Spot."),
    bullets: [L("Review the plan on Atlas", "راجع الخطة في أطلس", "Vérifiez le plan sur Atlas"), L("Open Binance Spot", "افتح بينانس سبوت", "Ouvrez Binance Spot"), L("You place the order manually", "تضع الأمر يدويًا", "Vous passez l'ordre manuellement")], phones: ["f:binance", "f:journal"] },
  { id: "dca", name: L("DCA Planner", "مخطط DCA", "Planificateur DCA"),
    headline: L("Plan your recurring buys", "خطّط لمشترياتك الدورية", "Planifiez vos achats récurrents"),
    desc: L("Lay out planned purchase slots, track your average entry, and open Binance Spot to buy manually.", "حدّد مواعيد الشراء المخططة وتابع متوسط الدخول وافتح بينانس سبوت للشراء يدويًا.", "Définissez vos achats planifiés, suivez votre prix d'entrée moyen et ouvrez Binance Spot pour acheter manuellement."),
    bullets: [L("Planned purchase slots", "مواعيد شراء مخططة", "Achats planifiés"), L("Average entry price", "متوسط سعر الدخول", "Prix d'entrée moyen"), L("Manual buy on Binance Spot", "شراء يدوي في بينانس سبوت", "Achat manuel sur Binance Spot")], phones: ["f:dca", "investor"] },
  { id: "investor", name: L("Atlas Investor", "أطلس للمستثمر", "Atlas Investisseur"),
    headline: L("Track your long-term portfolio", "تابع محفظتك طويلة الأجل", "Suivez votre portefeuille long terme"),
    desc: L("Atlas Investor shows invested capital, value, ROI and allocation in USDT or MRU. The phone shows demo data.", "يعرض أطلس للمستثمر رأس المال والقيمة والعائد والتوزيع بـ USDT أو الأوقية. الهاتف يعرض بيانات تجريبية.", "Atlas Investisseur affiche capital investi, valeur, ROI et répartition en USDT ou MRU. Le téléphone montre des données de démo."),
    bullets: [L("Invested capital and value", "رأس المال والقيمة", "Capital investi et valeur"), L("Allocation by asset", "التوزيع حسب الأصل", "Répartition par actif"), L("USDT or MRU display", "العرض بـ USDT أو الأوقية", "Affichage USDT ou MRU")], phones: ["investor", "home"] },
  { id: "academy", name: L("Atlas Academy", "أكاديمية أطلس", "Académie Atlas"),
    headline: L("Learn crypto trading step by step", "تعلّم تداول العملات الرقمية خطوة بخطوة", "Apprenez le trading crypto pas à pas"),
    desc: L("Free lessons on trading basics, technical analysis and risk management, plus 1-on-1 coaching on WhatsApp.", "دروس مجانية في أساسيات التداول والتحليل الفني وإدارة المخاطر، مع تدريب فردي عبر واتساب.", "Leçons gratuites sur les bases, l'analyse technique et la gestion du risque, plus coaching individuel sur WhatsApp."),
    bullets: [L("Trading basics", "أساسيات التداول", "Bases du trading"), L("Technical analysis and risk", "التحليل الفني وإدارة المخاطر", "Analyse technique et risque"), L("1-on-1 coaching", "تدريب فردي", "Coaching individuel")], phones: ["f:academy", "home"] },
  { id: "updates", name: L("Platform updates", "تحديثات المنصة", "Mises à jour"),
    headline: L("What's new on Atlas Trading", "الجديد في أطلس للتداول", "Les nouveautés d'Atlas Trading"),
    desc: L("Edit this text to announce a new feature or an update.", "عدّل هذا النص للإعلان عن ميزة جديدة أو تحديث.", "Modifiez ce texte pour annoncer une nouvelle fonctionnalité ou une mise à jour."),
    bullets: [L("New tools and improvements", "أدوات وتحسينات جديدة", "Nouveaux outils et améliorations"), L("Announcements from Atlas", "إعلانات من أطلس", "Annonces d'Atlas"), L("atlastrading.app", "atlastrading.app", "atlastrading.app")], phones: ["home", "investor"] },
];

export const featureOf = (id: FeatureId): Feature => FEATURES.find((f) => f.id === id) ?? FEATURES[0];
export const SCREEN_IDS: ScreenId[] = ["home", "investor", ...FEATURES.map((f) => `f:${f.id}` as ScreenId)];
export const SCREEN_NAMES: Record<"home" | "investor", L3> = {
  home: L("Atlas app (Radar · Trade Feed · Analyzer)", "تطبيق أطلس (رادار · صفقات · محلل)", "App Atlas (Radar · Fil · Analyseur)"),
  investor: L("Atlas Investor (demo data)", "أطلس للمستثمر (بيانات تجريبية)", "Atlas Investisseur (données de démo)"),
};
export const screenName = (id: ScreenId, lang: Lang): string => (id === "home" || id === "investor" ? SCREEN_NAMES[id][lang] : featureOf(id.slice(2) as FeatureId).name[lang]);

// ───────────── layout engine ─────────────
export type Preset = "side" | "stagger" | "fan";
export const PRESETS: Preset[] = ["side", "stagger", "fan"];
export type Slot = { cx: number; cy: number; w: number; rot: number; z: number };
export type PhoneAdj = { screen: ScreenId; size: number; dx: number; dy: number; rot: number };

/** Outer height of a phone frame of outer width `w` (390x844 screen, 7px bezel). */
export const phoneH = (w: number): number => ((w - 14) * 844) / 390 + 14;
const MAX_W = 520;

export function layoutPhones(fmt: FormatId, n: number, preset: Preset, rtl = false): Slot[] {
  const R = FORMATS[fmt].phones;
  const count = Math.min(3, Math.max(1, Math.round(n)));
  const rad = (d: number) => (d * Math.PI) / 180;
  let slots: Slot[];
  if (preset === "fan") {
    const rots = count === 1 ? [0] : count === 2 ? [-6, 6] : [-8, 0, 8];
    const maxR = rad(Math.max(...rots.map(Math.abs)));
    const step = 0.62;
    const wW = R.w / (1 + (count - 1) * step + (2.1641 * Math.sin(maxR) + Math.cos(maxR) - 1) + 0.01);
    const wH = (R.h + 16.3 * Math.cos(maxR)) / (2.1641 * Math.cos(maxR) + Math.sin(maxR));
    const w = Math.min(wW, wH, MAX_W);
    const total = w + (count - 1) * w * step;
    const x0 = R.x + (R.w - total) / 2 + w / 2;
    slots = rots.map((r, i) => ({ cx: x0 + i * w * step, cy: R.y + R.h / 2, w, rot: r, z: count === 3 && i === 1 ? 3 : i }));
  } else {
    const gap = R.w * 0.04;
    const d = preset === "stagger" && count > 1 ? R.h * 0.07 : 0;
    const wW = (R.w - (count - 1) * gap) / count;
    const wH = (R.h - d + 16.3) / 2.1641;
    const w = Math.min(wW, wH, MAX_W);
    const h = phoneH(w);
    const total = count * w + (count - 1) * gap;
    const x0 = R.x + (R.w - total) / 2 + w / 2;
    const top = R.y + (R.h - (h + d)) / 2;
    slots = Array.from({ length: count }, (_, i) => ({ cx: x0 + i * (w + gap), cy: top + h / 2 + (i % 2 === 1 ? d : 0), w, rot: 0, z: i }));
  }
  return rtl ? slots.map((s) => ({ ...s, cx: FORMATS[fmt].w - s.cx, rot: -s.rot })) : slots;
}

/** Final placement of a phone: the layout slot plus the user's size / position / rotation adjustments. */
export function placePhone(fmt: FormatId, slot: Slot, adj: Pick<PhoneAdj, "size" | "dx" | "dy" | "rot">): Slot {
  const F = FORMATS[fmt];
  return { ...slot, w: (slot.w * clamp(adj.size, 50, 150)) / 100, cx: slot.cx + (clamp(adj.dx, -40, 40) * F.w) / 100, cy: slot.cy + (clamp(adj.dy, -40, 40) * F.h) / 100, rot: slot.rot + clamp(adj.rot, -25, 25) };
}

/** Axis-aligned bounding box of a (rotated) phone. */
export function phoneBounds(s: Slot): { left: number; top: number; right: number; bottom: number } {
  const h = phoneH(s.w), a = (Math.abs(s.rot) * Math.PI) / 180;
  const bw = s.w * Math.cos(a) + h * Math.sin(a), bh = s.w * Math.sin(a) + h * Math.cos(a);
  return { left: s.cx - bw / 2, right: s.cx + bw / 2, top: s.cy - bh / 2, bottom: s.cy + bh / 2 };
}

export function defaultPhones(featureId: FeatureId, n: number): PhoneAdj[] {
  const base = featureOf(featureId).phones;
  const extra: ScreenId[] = ["home", "investor", "f:feed"];
  const screens = [...base, ...extra.filter((s) => !base.includes(s))];
  return Array.from({ length: Math.min(3, Math.max(1, n)) }, (_, i) => ({ screen: screens[i], size: 100, dx: 0, dy: 0, rot: 0 }));
}

// ───────────── small helpers ─────────────
export function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}
export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
/** WCAG relative luminance 0..1 of a #rrggbb colour. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const HEADLINE_MAX = 70;
export const DESC_MAX = 180;
export const studioFileName = (tpl: FeatureId, fmt: FormatId, lang: Lang, theme: "dark" | "light"): string =>
  `atlas-${tpl}-${FORMATS[fmt].ratio.replace(":", "x")}-${lang}-${theme}.png`;
