// ATLAS MARKET INTELLIGENCE — self-contained translations for this page.
// Kept separate from lib/i18n.tsx so this feature never needs to touch that
// file. Usage: const tr = (key: string) => miT(lang, key);

export type MiLang = "en" | "ar" | "fr";

type Dict = { [key: string]: string | Dict };

function flatten(dict: Dict, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(dict)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const en: Dict = {
  title: "ATLAS MARKET INTELLIGENCE",
  subtitle:
    "A curated market-research view of crypto assets tied to major institutional portfolios, indices, and public narratives. This is a research tool for discovery and comparison — not a signal generator.",
  disclaimer:
    "Descriptive market analysis only. Nothing on this page is a prediction, a trading signal, or a guarantee of future performance.",
  filterAll: "All categories",
  category: {
    grayscale: "Grayscale Trust",
    coinbase50: "Coinbase 50 Index",
    madeInUsa: "Made in USA",
    worldLiberty: "World Liberty Financial",
    grayscaleShort: "Grayscale",
    coinbase50Short: "COIN50",
    madeInUsaShort: "Made in USA",
    worldLibertyShort: "WLFI",
  },
  categoryKindOfficial: "Official index / portfolio",
  categoryKindNarrative: "Narrative / community classification — not an official index",
  groups: {
    assets: "assets",
    up: "up",
    down: "down",
    today: "today",
    official: "Official index",
    narrative: "Narrative",
  },
  searchPlaceholder: "Search ticker…",
  sort: {
    rank: "Sort: Strength rank",
    change24h: "Sort: 24h change",
    perf7d: "Sort: 7d performance",
    perf30d: "Sort: 30d performance",
    volume: "Sort: Volume",
    name: "Sort: Name",
  },
  loading: "Loading market data…",
  error: "Couldn't load live market data right now. Showing the last update will resume automatically.",
  staleNotice: "Showing last available data — live refresh failed",
  lastUpdated: "Last updated",
  empty: "No assets match this filter.",
  insufficientHistory: "Limited price history available for this asset yet",
  col: {
    rank: "#",
    asset: "Asset",
    price: "Price",
    change24h: "24h",
    perf7d: "7d",
    perf30d: "30d",
    volume: "Volume",
    categories: "Category",
    score: "Strength",
  },
  methodology: {
    title: "Market strength ranking — methodology",
    body:
      "Every asset gets a 0-100 strength score built from seven measurable, equally-documented components, each converted to a percentile rank across the tracked universe before being weighted. The score describes relative market behavior over the last 30 days — it does not predict what happens next.",
    w30d: "30-day performance — 25%",
    w7d: "7-day performance — 15%",
    wRelBtc: "Relative performance vs. BTC (7d & 30d blended) — 20%",
    wTrend: "Trend strength (share of up-days in the last 30 days) — 15%",
    wVolume: "Volume change (last 7d vs. prior 7d average) — 10%",
    wLiquidity: "Liquidity (current 24h quote volume) — 10%",
    wVolatility: "Volatility (lower is scored higher) — 5%",
    disclaimer: "This ranking is descriptive market analysis, not a prediction. It does not claim any asset will rise, and it is not investment advice.",
  },
  history: {
    title: "Historical performance since baseline",
    baseline: "Baseline date",
    outperformPrefix: "Since the baseline,",
    outperformSuffix: "of tracked assets with enough history have outperformed BTC.",
    btcSince: "BTC since baseline",
    best: "Best performers",
    worst: "Worst performers",
    buildingUp: "Historical comparison will appear once enough snapshots have been recorded from the baseline date.",
    universeChanges: "Changes to the tracked asset list",
    disclaimer:
      "This tracked universe is a research reference, not an executable portfolio. These figures are not actual trading results and do not represent profits or losses from real positions.",
  },
  authGate: {
    title: "Join Atlas Trading for free",
    body: "Sign in to view Atlas Market Intelligence — strength rankings, historical performance, and more.",
    signIn: "Sign In",
    signUp: "Create your free account →",
  },
};

const ar: Dict = {
  title: "أطلس ماركت إنتليجنس",
  subtitle:
    "أداة بحث سوقي مختارة لأصول العملات المشفرة المرتبطة بمحافظ مؤسساتية ومؤشرات وسرديات رئيسية. هذه أداة بحث للاكتشاف والمقارنة — وليست مولد إشارات تداول.",
  disclaimer:
    "تحليل سوقي وصفي فقط. لا شيء في هذه الصفحة يعد تنبؤًا أو إشارة تداول أو ضمانًا لأداء مستقبلي.",
  filterAll: "جميع الفئات",
  category: {
    grayscale: "صناديق جرايسكيل",
    coinbase50: "مؤشر كوينبيز 50",
    madeInUsa: "صنع أمريكي",
    worldLiberty: "ورلد ليبرتي فاينانشال",
    grayscaleShort: "جرايسكيل",
    coinbase50Short: "COIN50",
    madeInUsaShort: "صنع أمريكي",
    worldLibertyShort: "WLFI",
  },
  categoryKindOfficial: "مؤشر رسمي / محفظة رسمية",
  categoryKindNarrative: "تصنيف سردي / مجتمعي — ليس مؤشرًا رسميًا",
  groups: {
    assets: "أصل",
    up: "صاعد",
    down: "هابط",
    today: "اليوم",
    official: "مؤشر رسمي",
    narrative: "سردية",
  },
  searchPlaceholder: "ابحث عن رمز…",
  sort: {
    rank: "ترتيب: قوة السوق",
    change24h: "ترتيب: تغير 24 ساعة",
    perf7d: "ترتيب: أداء 7 أيام",
    perf30d: "ترتيب: أداء 30 يومًا",
    volume: "ترتيب: الحجم",
    name: "ترتيب: الاسم",
  },
  loading: "جارٍ تحميل بيانات السوق…",
  error: "تعذّر تحميل بيانات السوق الحية الآن. سيتم استئناف التحديث تلقائيًا.",
  staleNotice: "يُعرض آخر بيانات متوفرة — فشل التحديث المباشر",
  lastUpdated: "آخر تحديث",
  empty: "لا توجد أصول مطابقة لهذا الفلتر.",
  insufficientHistory: "بيانات سعرية تاريخية محدودة لهذا الأصل حتى الآن",
  col: {
    rank: "#",
    asset: "الأصل",
    price: "السعر",
    change24h: "24س",
    perf7d: "7ي",
    perf30d: "30ي",
    volume: "الحجم",
    categories: "الفئة",
    score: "القوة",
  },
  methodology: {
    title: "ترتيب قوة السوق — المنهجية",
    body:
      "يحصل كل أصل على درجة قوة من 0 إلى 100 مبنية على سبعة عناصر قابلة للقياس وموثّقة، يُحوّل كل منها إلى ترتيب مئوي ضمن المجموعة المتابعة قبل الترجيح. تصف الدرجة السلوك النسبي للسوق خلال آخر 30 يومًا — ولا تتنبأ بما سيحدث لاحقًا.",
    w30d: "أداء 30 يومًا — 25%",
    w7d: "أداء 7 أيام — 15%",
    wRelBtc: "الأداء النسبي مقابل البيتكوين (7ي و 30ي) — 20%",
    wTrend: "قوة الاتجاه (نسبة أيام الصعود خلال 30 يومًا) — 15%",
    wVolume: "تغير الحجم (آخر 7 أيام مقابل السابقة) — 10%",
    wLiquidity: "السيولة (حجم التداول خلال 24 ساعة) — 10%",
    wVolatility: "التقلب (الأقل يحصل درجة أعلى) — 5%",
    disclaimer: "هذا الترتيب تحليل سوقي وصفي، وليس تنبؤًا. لا يدعي أن أي أصل سيرتفع، وليس نصيحة استثمارية.",
  },
  history: {
    title: "الأداء التاريخي منذ خط الأساس",
    baseline: "تاريخ خط الأساس",
    outperformPrefix: "منذ خط الأساس،",
    outperformSuffix: "من الأصول المتابعة ذات البيانات الكافية تفوقت على البيتكوين.",
    btcSince: "أداء البيتكوين منذ خط الأساس",
    best: "الأفضل أداءً",
    worst: "الأضعف أداءً",
    buildingUp: "ستظهر المقارنة التاريخية بعد تسجيل عدد كافٍ من اللقطات منذ تاريخ خط الأساس.",
    universeChanges: "تغييرات قائمة الأصول المتابعة",
    disclaimer:
      "هذه المجموعة المتابعة مرجع بحثي فقط، وليست محفظة قابلة للتنفيذ. هذه الأرقام ليست نتائج تداول فعلية ولا تمثل أرباحًا أو خسائر من صفقات حقيقية.",
  },
  authGate: {
    title: "انضم إلى Atlas Trading مجانًا",
    body: "سجّل الدخول لعرض ذكاء السوق أطلس — تصنيف القوة، الأداء التاريخي، والمزيد.",
    signIn: "تسجيل الدخول",
    signUp: "أنشئ حسابك المجاني ←",
  },
};

const fr: Dict = {
  title: "ATLAS MARKET INTELLIGENCE",
  subtitle:
    "Un outil de recherche de marché pour suivre une sélection d'actifs crypto liés à des portefeuilles institutionnels, indices et narratifs publics majeurs. Un outil de recherche, pas un générateur de signaux.",
  disclaimer:
    "Analyse de marché descriptive uniquement. Rien sur cette page n'est une prédiction, un signal de trading, ou une garantie de performance future.",
  filterAll: "Toutes les catégories",
  category: {
    grayscale: "Grayscale Trust",
    coinbase50: "Indice Coinbase 50",
    madeInUsa: "Made in USA",
    worldLiberty: "World Liberty Financial",
    grayscaleShort: "Grayscale",
    coinbase50Short: "COIN50",
    madeInUsaShort: "Made in USA",
    worldLibertyShort: "WLFI",
  },
  categoryKindOfficial: "Indice officiel / portefeuille officiel",
  categoryKindNarrative: "Classification narrative / communautaire — pas un indice officiel",
  groups: {
    assets: "actifs",
    up: "en hausse",
    down: "en baisse",
    today: "aujourd'hui",
    official: "Indice officiel",
    narrative: "Narratif",
  },
  searchPlaceholder: "Rechercher un ticker…",
  sort: {
    rank: "Trier : Classement de force",
    change24h: "Trier : Variation 24h",
    perf7d: "Trier : Performance 7j",
    perf30d: "Trier : Performance 30j",
    volume: "Trier : Volume",
    name: "Trier : Nom",
  },
  loading: "Chargement des données de marché…",
  error: "Impossible de charger les données de marché en direct. L'actualisation reprendra automatiquement.",
  staleNotice: "Affichage des dernières données disponibles — l'actualisation a échoué",
  lastUpdated: "Dernière mise à jour",
  empty: "Aucun actif ne correspond à ce filtre.",
  insufficientHistory: "Historique de prix encore limité pour cet actif",
  col: {
    rank: "#",
    asset: "Actif",
    price: "Prix",
    change24h: "24h",
    perf7d: "7j",
    perf30d: "30j",
    volume: "Volume",
    categories: "Catégorie",
    score: "Force",
  },
  methodology: {
    title: "Classement de force de marché — méthodologie",
    body:
      "Chaque actif reçoit un score de force de 0 à 100 construit à partir de sept composantes mesurables et documentées, chacune convertie en rang percentile au sein de l'univers suivi avant pondération. Le score décrit le comportement relatif du marché sur les 30 derniers jours — il ne prédit pas ce qui va suivre.",
    w30d: "Performance sur 30 jours — 25 %",
    w7d: "Performance sur 7 jours — 15 %",
    wRelBtc: "Performance relative vs. BTC (7j et 30j combinés) — 20 %",
    wTrend: "Force de tendance (part de jours haussiers sur 30 jours) — 15 %",
    wVolume: "Variation du volume (7 derniers jours vs. 7 jours précédents) — 10 %",
    wLiquidity: "Liquidité (volume en USDT sur 24h) — 10 %",
    wVolatility: "Volatilité (plus faible = score plus élevé) — 5 %",
    disclaimer: "Ce classement est une analyse de marché descriptive, pas une prédiction. Il n'affirme pas qu'un actif va monter et ne constitue pas un conseil en investissement.",
  },
  history: {
    title: "Performance historique depuis la référence",
    baseline: "Date de référence",
    outperformPrefix: "Depuis la date de référence,",
    outperformSuffix: "des actifs suivis disposant d'un historique suffisant ont surperformé le BTC.",
    btcSince: "BTC depuis la référence",
    best: "Meilleures performances",
    worst: "Pires performances",
    buildingUp: "La comparaison historique apparaîtra une fois suffisamment d'instantanés enregistrés depuis la date de référence.",
    universeChanges: "Changements de la liste d'actifs suivis",
    disclaimer:
      "Cet univers suivi est une référence de recherche, pas un portefeuille exécutable. Ces chiffres ne sont pas des résultats de trading réels et ne représentent pas de profits ou pertes sur des positions réelles.",
  },
  authGate: {
    title: "Rejoignez Atlas Trading gratuitement",
    body: "Connectez-vous pour voir Atlas Market Intelligence — classement de force, performance historique, et plus.",
    signIn: "Se connecter",
    signUp: "Créez votre compte gratuit →",
  },
};

const FLAT = {
  en: flatten(en),
  ar: flatten(ar),
  fr: flatten(fr),
} as const;

export function miT(lang: MiLang, key: string): string {
  return FLAT[lang]?.[key] ?? FLAT.en[key] ?? key;
}
