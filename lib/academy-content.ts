export type AcademySection = "basics" | "technical" | "risk" | "habits";

export type LinkedToolName = "Radar" | "Analyzer" | "Journal" | "Risk" | "Trade Plan";

export type Lesson = {
  slug: string;
  section: AcademySection;
  title: string;
  summary: string;
  /** Plain paragraphs separated by a blank line. Rendered as <p> per paragraph. */
  body: string;
  diagramId: string;
  linkedTool: {
    name: LinkedToolName;
    href: string;
    ctaText: string;
  };
  /** Phase 1: false = placeholder body/diagram, not yet written for real. */
  ready: boolean;
};

const COMING_SOON_BODY = "هذا الدرس قيد الإعداد حاليًا وسيُضاف قريبًا.";

export const SECTION_LABELS: Record<AcademySection, string> = {
  basics: "الأساسيات",
  technical: "التحليل الفني",
  risk: "إدارة المخاطر",
  habits: "عادات وأخطاء شائعة",
};

export const SECTION_ORDER: AcademySection[] = ["basics", "technical", "risk", "habits"];

export const lessons: Lesson[] = [
  // ───────── Basics ─────────
  {
    slug: "what-is-crypto",
    section: "basics",
    title: "ما هي العملات الرقمية؟",
    summary: "شرح مبسط لفكرة البلوكتشين والعملات الرقمية دون تعقيد تقني.",
    body: COMING_SOON_BODY,
    diagramId: "what-is-crypto",
    linkedTool: { name: "Radar", href: "/radar", ctaText: "استكشف السوق الآن → Radar" },
    ready: false,
  },
  {
    slug: "investing-vs-trading",
    section: "basics",
    title: "الاستثمار مقابل التداول",
    summary: "الفرق بين الاحتفاظ طويل المدى (HODL) والتداول النشط.",
    body: COMING_SOON_BODY,
    diagramId: "investing-vs-trading",
    linkedTool: { name: "Journal", href: "/journal", ctaText: "سجّل أول قرار تداول لك → Journal" },
    ready: false,
  },
  {
    slug: "reading-candlesticks",
    section: "basics",
    title: "قراءة الشموع اليابانية",
    summary: "رسم يوضح شمعة صاعدة وهابطة مع الفتح والإغلاق والقمة والقاع.",
    body: COMING_SOON_BODY,
    diagramId: "reading-candlesticks",
    linkedTool: { name: "Analyzer", href: "/analyzer", ctaText: "جرّب قراءة شارت حقيقي الآن → Analyzer" },
    ready: false,
  },
  {
    slug: "trend-direction",
    section: "basics",
    title: "الاتجاه العام (Trend)",
    summary: "رسم يوضح اتجاهًا صاعدًا وهابطًا وعرضيًا (sideways).",
    body: COMING_SOON_BODY,
    diagramId: "trend-direction",
    linkedTool: { name: "Analyzer", href: "/analyzer", ctaText: "جرّب تحديد الاتجاه الآن → Analyzer" },
    ready: false,
  },

  // ───────── Technical ─────────
  {
    slug: "support-resistance",
    section: "technical",
    title: "الدعم والمقاومة",
    summary: "لماذا يتوقف السعر بشكل متكرر عند نفس المستويات، ولماذا تتحول المقاومة إلى دعم بعد الاختراق.",
    body: `المقاومة هي مستوى سعري يتوقف عنده الصعود بشكل متكرر لأن البائعين يسيطرون هناك. الدعم هو العكس — مستوى يتوقف عنده الهبوط لأن المشترين يدخلون بقوة.

كلما ارتد السعر عن نفس المستوى مرات أكثر، كلما أصبح ذلك المستوى أقوى وأكثر موثوقية.

عندما يخترق السعر المقاومة بقوة، فإنها غالبًا تتحول إلى دعم جديد — وهذا بالضبط ما تبحث عنه أداة Analyzer عند تحديد نقاط الدخول.`,
    diagramId: "support-resistance",
    linkedTool: { name: "Analyzer", href: "/analyzer", ctaText: "جرّب المفهوم على شارت حقيقي الآن → Analyzer" },
    ready: true,
  },
  {
    slug: "breakout-retest",
    section: "technical",
    title: "الاختراق وإعادة الاختبار",
    summary: "اختراق مستوى، ثم عودة السعر لاختباره كدعم جديد قبل الاستمرار.",
    body: COMING_SOON_BODY,
    diagramId: "breakout-retest",
    linkedTool: { name: "Radar", href: "/radar", ctaText: "ابحث عن اختراقات الآن → Radar" },
    ready: false,
  },
  {
    slug: "relative-strength-btc",
    section: "technical",
    title: "القوة النسبية مقابل BTC",
    summary: "متى تتفوق عملة على البيتكوين، ولماذا يهم ذلك.",
    body: COMING_SOON_BODY,
    diagramId: "relative-strength-btc",
    linkedTool: { name: "Radar", href: "/radar", ctaText: "شاهد العملات المتفوقة على BTC الآن → Radar" },
    ready: false,
  },

  // ───────── Risk ─────────
  {
    slug: "risk-percentage",
    section: "risk",
    title: "لماذا نسبة المخاطرة أهم من دقة التوقع",
    summary: "كيف تؤدي المخاطرة العالية إلى تصفية الحساب حتى مع نسبة نجاح جيدة.",
    body: COMING_SOON_BODY,
    diagramId: "risk-percentage",
    linkedTool: { name: "Risk", href: "/risk", ctaText: "احسب مخاطرتك الآن → Risk" },
    ready: false,
  },
  {
    slug: "stop-loss",
    section: "risk",
    title: "وقف الخسارة (Stop-loss)",
    summary: "لماذا يحتاج كل مركز إلى خط وقف خسارة واضح تحت نقطة الدخول.",
    body: COMING_SOON_BODY,
    diagramId: "stop-loss",
    linkedTool: { name: "Risk", href: "/risk", ctaText: "حدد وقف خسارتك الآن → Risk" },
    ready: false,
  },
  {
    slug: "position-sizing",
    section: "risk",
    title: "حساب حجم الصفقة",
    summary: "العلاقة بين حجم الحساب، نسبة المخاطرة، والمسافة لوقف الخسارة.",
    body: COMING_SOON_BODY,
    diagramId: "position-sizing",
    linkedTool: { name: "Risk", href: "/risk", ctaText: "احسب حجم صفقتك الآن → Risk" },
    ready: false,
  },
  {
    slug: "trade-plan-checklist",
    section: "risk",
    title: "خطة التداول قبل الدخول",
    summary: "عناصر الخطة: نقطة الدخول، الهدف، وقف الخسارة، ونسبة R:R.",
    body: COMING_SOON_BODY,
    diagramId: "trade-plan-checklist",
    linkedTool: { name: "Trade Plan", href: "/trade-plan", ctaText: "ابنِ خطة صفقتك الآن → Trade Plan" },
    ready: false,
  },

  // ───────── Habits ─────────
  {
    slug: "fomo",
    section: "habits",
    title: "خوف فوات الفرصة (FOMO)",
    summary: "دخول متأخر بعد صعود حاد، ثم تصحيح.",
    body: COMING_SOON_BODY,
    diagramId: "fomo",
    linkedTool: { name: "Journal", href: "/journal", ctaText: "راجع قراراتك السابقة الآن → Journal" },
    ready: false,
  },
  {
    slug: "trading-journal-habit",
    section: "habits",
    title: "أهمية اليوميات",
    summary: "دورة: خطة → تنفيذ → تسجيل → مراجعة → تحسين.",
    body: COMING_SOON_BODY,
    diagramId: "trading-journal-habit",
    linkedTool: { name: "Journal", href: "/journal", ctaText: "ابدأ يومياتك الآن → Journal" },
    ready: false,
  },
  {
    slug: "signals-vs-understanding",
    section: "habits",
    title: "الإشارات مقابل الفهم الحقيقي",
    summary: "لماذا الاعتماد على الفهم أهم من النسخ الأعمى للإشارات.",
    body: COMING_SOON_BODY,
    diagramId: "signals-vs-understanding",
    linkedTool: { name: "Analyzer", href: "/analyzer", ctaText: "ابنِ فهمك الخاص الآن → Analyzer" },
    ready: false,
  },
];

export function getLesson(slug: string): Lesson | undefined {
  return lessons.find((l) => l.slug === slug);
}

export function lessonsBySection(section: AcademySection): Lesson[] {
  return lessons.filter((l) => l.section === section);
}
