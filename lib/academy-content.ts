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
  /** False only for intentionally text-only lessons (e.g. signals-vs-understanding) — distinguishes "no diagram by design" from "not built yet". */
  hasDiagram?: boolean;
  /** Omitted for foundational/awareness lessons with no single matching tool. */
  linkedTool?: {
    name: LinkedToolName;
    href: string;
    ctaText: string;
  };
  /** Phase 1: false = placeholder body/diagram, not yet written for real. */
  ready: boolean;
};

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
    body: `العملات الرقمية هي أصول مالية تعمل على شبكة موزعة تسمى البلوكتشين، بدون وسيط مركزي كالبنك. كل معاملة تُسجَّل في سجل عام يراه الجميع ولا يمكن لأحد تعديله بمفرده.

البيتكوين (BTC) كانت أول عملة من هذا النوع، تليها آلاف العملات الأخرى بأغراض مختلفة — بعضها للدفع، وبعضها لتشغيل تطبيقات (مثل إيثريوم).

المهم لك كمتداول: فهم أن السعر يتحرك بالعرض والطلب فقط، لا بقرار شركة أو بنك مركزي — وهذا يجعل التقلبات أكبر وأسرع من الأسواق التقليدية.`,
    diagramId: "what-is-crypto",
    ready: true,
  },
  {
    slug: "investing-vs-trading",
    section: "basics",
    title: "الاستثمار مقابل التداول",
    summary: "الفرق بين الاحتفاظ طويل المدى (HODL) والتداول النشط.",
    body: `المستثمر يشتري عملة ويحتفظ بها لفترة طويلة، متوقعاً أن ترتفع قيمتها مع نمو السوق عموماً. لا يهمه تقلب السعر يومياً.

المتداول يدخل ويخرج من الصفقات بفترات أقصر (ساعات، أيام، أسابيع)، معتمداً على قراءة الشارت وتحديد نقاط دخول وخروج دقيقة.

الفرق ليس في "من أذكى" — بل في الوقت المتاح لك والمخاطرة التي تتحمّلها. التداول يحتاج انضباطاً وخطة واضحة أكثر من الاستثمار طويل المدى.`,
    diagramId: "investing-vs-trading",
    linkedTool: { name: "Journal", href: "/journal", ctaText: "سجّل أي نوع من الصفقات تقوم به فعلاً → Journal" },
    ready: true,
  },
  {
    slug: "reading-candlesticks",
    section: "basics",
    title: "قراءة الشموع اليابانية",
    summary: "رسم يوضح شمعة صاعدة وهابطة مع الفتح والإغلاق والقمة والقاع.",
    body: `كل شمعة تمثل فترة زمنية محددة (ساعة، يوم..) وتحمل 4 معلومات: سعر الافتتاح، الإغلاق، أعلى نقطة، وأدنى نقطة.

الشمعة الخضراء (أو البيضاء) تعني أن الإغلاق كان أعلى من الافتتاح — ضغط شراء. الشمعة الحمراء تعني العكس — ضغط بيع.

الجسم (Body) يوضح المسافة بين الفتح والإغلاق، والذيل (Wick) يوضح أقصى نقطة وصل إليها السعر قبل أن يرتد.`,
    diagramId: "reading-candlesticks",
    linkedTool: { name: "Analyzer", href: "/analyzer", ctaText: "جرّب قراءة شارت حقيقي الآن → Analyzer" },
    ready: true,
  },
  {
    slug: "trend-direction",
    section: "basics",
    title: "الاتجاه العام (Trend)",
    summary: "رسم يوضح اتجاهًا صاعدًا وهابطًا وعرضيًا (sideways).",
    body: `الاتجاه الصاعد يتكون من قمم وقيعان مرتفعة تدريجياً. الاتجاه الهابط هو العكس — قمم وقيعان منخفضة تدريجياً.

الاتجاه العرضي (Sideways) يعني أن السعر يتحرك بين نطاق محدد بدون اتجاه واضح — غالباً فرصة أضعف للتداول.

التداول مع الاتجاه العام أسهل وأقل مخاطرة من محاولة التنبؤ بانعكاسه — القاعدة الشائعة: "الاتجاه صديقك حتى ينكسر."`,
    diagramId: "trend-direction",
    linkedTool: { name: "Radar", href: "/radar", ctaText: "شاهد أي العملات في اتجاه صاعد الآن → Radar" },
    ready: true,
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
    body: `عندما يكسر السعر مستوى مقاومة بقوة (بشمعة كبيرة وحجم تداول مرتفع)، فهذا اختراق. لكن الدخول المباشر عند الاختراق خطر — كثير من الاختراقات تكون كاذبة (Fakeout).

الأسلم هو انتظار "إعادة الاختبار" — أن يعود السعر لنفس المستوى الذي كسره، ويرتد عنه صعوداً بدل أن يعود تحته. هذا يؤكد أن المستوى تحول من مقاومة إلى دعم فعلي.

هذا بالضبط ما تبحث عنه أداة Analyzer عند تصنيف فرصة كـ "جاهزة الآن" بدل "خطة معلّقة."`,
    diagramId: "breakout-retest",
    linkedTool: { name: "Analyzer", href: "/analyzer", ctaText: "شاهد كيف يحدد الـ Analyzer الاختراقات الحقيقية → Analyzer" },
    ready: true,
  },
  {
    slug: "relative-strength-btc",
    section: "technical",
    title: "القوة النسبية مقابل BTC",
    summary: "متى تتفوق عملة على البيتكوين، ولماذا يهم ذلك.",
    body: `ليست كل العملات تتحرك بنفس القوة. عملة ترتفع 5% بينما BTC يرتفع 2% فقط تكون "أقوى نسبياً" — وهذا مؤشر جيد على اهتمام المتداولين بها تحديداً.

العكس أيضاً مهم: عملة تنخفض أكثر من BTC في سوق هابط تدل على ضعف حقيقي، لا تقلب عادي.

فلتر "Beating BTC" في Radar يرصد هذا تلقائياً على كل أزواج USDT، بدل أن تتابعها يدوياً واحدة تلو الأخرى.`,
    diagramId: "relative-strength-btc",
    linkedTool: { name: "Radar", href: "/radar", ctaText: "شاهد أي العملات تتفوق على BTC الآن → Radar" },
    ready: true,
  },

  // ───────── Risk ─────────
  {
    slug: "risk-percentage",
    section: "risk",
    title: "لماذا نسبة المخاطرة أهم من دقة التوقع",
    summary: "كيف تؤدي المخاطرة العالية إلى تصفية الحساب حتى مع نسبة نجاح جيدة.",
    body: `متداول يصيب 70% من صفقاته لكنه يخاطر بـ 20% من حسابه في كل صفقة سيصفّي حسابه عاجلاً — صفقتان خاسرتان متتاليتان فقط تكفي لخسارة كبيرة يصعب تعويضها.

متداول آخر يصيب 40% فقط لكنه يخاطر بـ 1% فقط لكل صفقة يمكنه الاستمرار لسنوات حتى مع سلسلة خسائر طويلة.

البقاء في السوق أهم من الربح السريع — وهذا يبدأ بنسبة مخاطرة صغيرة وثابتة، لا بالثقة في توقع معين.`,
    diagramId: "risk-percentage",
    linkedTool: { name: "Risk", href: "/risk", ctaText: "احسب نسبة مخاطرتك الآن قبل الصفقة القادمة → Risk" },
    ready: true,
  },
  {
    slug: "stop-loss",
    section: "risk",
    title: "وقف الخسارة (Stop-loss)",
    summary: "لماذا يحتاج كل مركز إلى خط وقف خسارة واضح تحت نقطة الدخول.",
    body: `وقف الخسارة هو أمر مسبق يُغلق الصفقة تلقائياً إذا تحرك السعر ضدك لمسافة معينة — يحمي رأس المال من خسارة غير محدودة إذا تحرك السوق بعكس توقعك.

يوضع وقف الخسارة عند نقطة تُثبت أن فكرة الصفقة أصلاً خاطئة — مثلاً تحت أقرب قاع أو مستوى دعم — لا عند مسافة عشوائية "تشعرك بالراحة."

التداول بدون وقف خسارة هو السبب الأول لتصفية الحسابات، حتى لو كانت الفكرة صحيحة في الأغلب.`,
    diagramId: "stop-loss",
    linkedTool: { name: "Risk", href: "/risk", ctaText: "أدخل بياناتك واحصل على مستوى وقف خسارة محسوب → Risk" },
    ready: true,
  },
  {
    slug: "position-sizing",
    section: "risk",
    title: "حساب حجم الصفقة",
    summary: "العلاقة بين حجم الحساب، نسبة المخاطرة، والمسافة لوقف الخسارة.",
    body: `حجم الصفقة الصحيح لا يُحدَّد عشوائياً — بل يُحسب من 3 أرقام: حجم حسابك، نسبة المخاطرة المسموحة (مثلاً 1%)، والمسافة بين نقطة الدخول ووقف الخسارة.

كلما كانت المسافة لوقف الخسارة أكبر، كلما وجب أن يكون حجم الصفقة أصغر — للحفاظ على نفس نسبة المخاطرة الثابتة.

هذا الحساب هو ما يفعله حاسبة Risk تلقائياً، بدل أن تخمّن الحجم بنفسك في كل مرة.`,
    diagramId: "position-sizing",
    linkedTool: { name: "Risk", href: "/risk", ctaText: "دع الحاسبة تحدد حجم صفقتك القادمة → Risk" },
    ready: true,
  },
  {
    slug: "trade-plan-checklist",
    section: "risk",
    title: "خطة التداول قبل الدخول",
    summary: "عناصر الخطة: نقطة الدخول، الهدف، وقف الخسارة، ونسبة R:R.",
    body: `الصفقة الجيدة تُخطَّط قبل الدخول، لا بعده. الخطة تشمل: نقطة الدخول، الهدف (أو الأهداف)، وقف الخسارة، ونسبة المخاطرة إلى المكسب (R:R).

كتابة هذه العناصر قبل الدخول تمنعك من تغيير القرار تحت تأثير العاطفة وسط تقلب السعر لحظة الصفقة.

نسبة R:R لا تقل عادة عن 1:2 — أي أن المكسب المحتمل ضعف الخسارة المحتملة على الأقل، حتى يكون النظام مربحاً على المدى الطويل رغم الخسائر الفردية.`,
    diagramId: "trade-plan-checklist",
    linkedTool: { name: "Trade Plan", href: "/trade-plan", ctaText: "اكتب خطتك قبل الصفقة القادمة → Trade Plan" },
    ready: true,
  },

  // ───────── Habits ─────────
  {
    slug: "fomo",
    section: "habits",
    title: "خوف فوات الفرصة (FOMO)",
    summary: "دخول متأخر بعد صعود حاد، ثم تصحيح.",
    body: `FOMO يحدث عندما ترى عملة ارتفعت بسرعة وتدخل متأخراً بدافع "لا أريد أن أفوّت الفرصة" — غالباً قرب نهاية الحركة، لا بدايتها.

الدخول في هذه اللحظة يعني شراء عند أعلى نقطة تقريباً، تماماً قبل التصحيح الطبيعي الذي يتبع كل صعود حاد.

الحل ليس تجاهل كل حركة قوية، بل انتظار نقطة دخول منطقية (كإعادة اختبار) بدل الانطلاق فوراً خلف السعر.`,
    diagramId: "fomo",
    linkedTool: { name: "Analyzer", href: "/analyzer", ctaText: "اعرف إن كانت اللحظة مناسبة للدخول أم فائتة → Analyzer" },
    ready: true,
  },
  {
    slug: "trading-journal-habit",
    section: "habits",
    title: "أهمية اليوميات",
    summary: "دورة: خطة → تنفيذ → تسجيل → مراجعة → تحسين.",
    body: `دورة التداول المحترف تمر بـ 4 خطوات متكررة: خطة → تنفيذ → تسجيل → مراجعة. أغلب المتداولين يتوقفون عند التنفيذ ولا يسجّلون أو يراجعون أبداً.

بدون تسجيل، تتكرر نفس الأخطاء دون أن تلاحظها — الخروج المبكر، تجاهل وقف الخسارة، الدخول بدون خطة.

اليوميات تحوّل التداول من تجربة عشوائية إلى نظام قابل للتحسين، لأنك ترى بوضوح ما ينجح وما يتكرر فشله.`,
    diagramId: "trading-journal-habit",
    linkedTool: { name: "Journal", href: "/journal", ctaText: "ابدأ تسجيل صفقاتك من الآن → Journal" },
    ready: true,
  },
  {
    slug: "signals-vs-understanding",
    section: "habits",
    title: "الإشارات مقابل الفهم الحقيقي",
    summary: "لماذا الاعتماد على الفهم أهم من النسخ الأعمى للإشارات.",
    body: `الاعتماد الكامل على إشارات جاهزة (من قناة أو شخص آخر) دون فهم السبب يجعلك عاجزاً عن اتخاذ القرار وحيداً، وعاجزاً عن معرفة متى تكون الإشارة خاطئة.

الفهم الحقيقي يعني أنك تستطيع تقييم أي صفقة بنفسك — حتى لو كانت الإشارة من مصدر موثوق — بدل تنفيذها بشكل أعمى.

الهدف من أقسام هذا الموقع ليس استبدال حكمك، بل بناء فهم تستخدمه لتقييم أي إشارة أو فرصة تصلك من أي مصدر.`,
    diagramId: "signals-vs-understanding",
    hasDiagram: false,
    ready: true,
  },
];

export function getLesson(slug: string): Lesson | undefined {
  return lessons.find((l) => l.slug === slug);
}

export function lessonsBySection(section: AcademySection): Lesson[] {
  return lessons.filter((l) => l.section === section);
}
