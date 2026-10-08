export type AcademySection = "basics" | "technical" | "risk" | "habits";

export type LinkedToolName = "Radar" | "Analyzer" | "Journal" | "Risk" | "Trade Plan";

export type Localized = { en: string; ar: string; fr: string };

export type Lesson = {
  slug: string;
  section: AcademySection;
  title: Localized;
  summary: Localized;
  /** Plain paragraphs separated by a blank line. Rendered as <p> per paragraph. */
  body: Localized;
  diagramId: string;
  /** False only for intentionally text-only lessons (e.g. signals-vs-understanding) — distinguishes "no diagram by design" from "not built yet". */
  hasDiagram?: boolean;
  /** Omitted for foundational/awareness lessons with no single matching tool. */
  linkedTool?: {
    name: LinkedToolName;
    href: string;
    ctaText: Localized;
  };
  ready: boolean;
};

export const SECTION_LABELS: Record<AcademySection, Localized> = {
  basics: { en: "Basics", ar: "الأساسيات", fr: "Les bases" },
  technical: { en: "Technical Analysis", ar: "التحليل الفني", fr: "Analyse technique" },
  risk: { en: "Risk Management", ar: "إدارة المخاطر", fr: "Gestion du risque" },
  habits: { en: "Habits & Mistakes", ar: "عادات وأخطاء شائعة", fr: "Habitudes et erreurs courantes" },
};

export const SECTION_ORDER: AcademySection[] = ["basics", "technical", "risk", "habits"];

export const lessons: Lesson[] = [
  // ───────── Basics ─────────
  {
    slug: "what-is-crypto",
    section: "basics",
    title: {
      en: "What Are Cryptocurrencies?",
      ar: "ما هي العملات الرقمية؟",
      fr: "Qu'est-ce qu'une cryptomonnaie ?",
    },
    summary: {
      en: "A simple explanation of blockchain and cryptocurrencies, without the technical jargon.",
      ar: "شرح مبسط لفكرة البلوكتشين والعملات الرقمية دون تعقيد تقني.",
      fr: "Une explication simple de la blockchain et des cryptomonnaies, sans jargon technique.",
    },
    body: {
      en: `Cryptocurrencies are financial assets that run on a distributed network called the blockchain, with no central intermediary like a bank. Every transaction is recorded in a public ledger that everyone can see, and no single party can alter it alone.

Bitcoin (BTC) was the first currency of this kind, followed by thousands of others built for different purposes — some for payments, others for running applications (like Ethereum).

What matters to you as a trader: price moves purely on supply and demand, not a company's or central bank's decision — which is exactly why volatility is bigger and faster than in traditional markets.`,
      ar: `العملات الرقمية هي أصول مالية تعمل على شبكة موزعة تسمى البلوكتشين، بدون وسيط مركزي كالبنك. كل معاملة تُسجَّل في سجل عام يراه الجميع ولا يمكن لأحد تعديله بمفرده.

البيتكوين (BTC) كانت أول عملة من هذا النوع، تليها آلاف العملات الأخرى بأغراض مختلفة — بعضها للدفع، وبعضها لتشغيل تطبيقات (مثل إيثريوم).

المهم لك كمتداول: فهم أن السعر يتحرك بالعرض والطلب فقط، لا بقرار شركة أو بنك مركزي — وهذا يجعل التقلبات أكبر وأسرع من الأسواق التقليدية.`,
      fr: `Les cryptomonnaies sont des actifs financiers qui fonctionnent sur un réseau distribué appelé la blockchain, sans intermédiaire central comme une banque. Chaque transaction est enregistrée dans un registre public que tout le monde peut voir, et personne ne peut le modifier seul.

Le Bitcoin (BTC) a été la première monnaie de ce type, suivie de milliers d'autres conçues pour des usages différents — certaines pour les paiements, d'autres pour faire fonctionner des applications (comme Ethereum).

Ce qui compte pour vous en tant que trader : le prix évolue uniquement selon l'offre et la demande, pas selon la décision d'une entreprise ou d'une banque centrale — c'est exactement pourquoi la volatilité y est plus forte et plus rapide que sur les marchés traditionnels.`,
    },
    diagramId: "what-is-crypto",
    ready: true,
  },
  {
    slug: "investing-vs-trading",
    section: "basics",
    title: {
      en: "Investing vs. Trading",
      ar: "الاستثمار مقابل التداول",
      fr: "Investissement vs trading",
    },
    summary: {
      en: "The difference between long-term holding (HODL) and active trading.",
      ar: "الفرق بين الاحتفاظ طويل المدى (HODL) والتداول النشط.",
      fr: "La différence entre la détention à long terme (HODL) et le trading actif.",
    },
    body: {
      en: `An investor buys a coin and holds it for a long period, expecting its value to rise as the overall market grows. Daily price swings don't matter much to them.

A trader enters and exits positions over much shorter timeframes (hours, days, weeks), relying on chart reading and precise entry and exit points.

The difference isn't about who's "smarter" — it's about the time you have available and the risk you're willing to take on. Trading demands more discipline and a clearer plan than long-term investing does.`,
      ar: `المستثمر يشتري عملة ويحتفظ بها لفترة طويلة، متوقعاً أن ترتفع قيمتها مع نمو السوق عموماً. لا يهمه تقلب السعر يومياً.

المتداول يدخل ويخرج من الصفقات بفترات أقصر (ساعات، أيام، أسابيع)، معتمداً على قراءة الشارت وتحديد نقاط دخول وخروج دقيقة.

الفرق ليس في "من أذكى" — بل في الوقت المتاح لك والمخاطرة التي تتحمّلها. التداول يحتاج انضباطاً وخطة واضحة أكثر من الاستثمار طويل المدى.`,
      fr: `L'investisseur achète une cryptomonnaie et la conserve longtemps, en s'attendant à ce que sa valeur augmente avec la croissance globale du marché. Les variations quotidiennes du prix ne l'affectent pas vraiment.

Le trader entre et sort de positions sur des horizons beaucoup plus courts (heures, jours, semaines), en s'appuyant sur la lecture du graphique et des points d'entrée et de sortie précis.

La différence ne tient pas à "qui est le plus intelligent" — mais au temps dont vous disposez et au risque que vous êtes prêt à assumer. Le trading exige plus de discipline et un plan plus clair que l'investissement à long terme.`,
    },
    diagramId: "investing-vs-trading",
    linkedTool: {
      name: "Journal",
      href: "/journal",
      ctaText: {
        en: "Log whichever kind of trade you actually make → Journal",
        ar: "سجّل أي نوع من الصفقات تقوم به فعلاً → Journal",
        fr: "Enregistrez le type de trade que vous faites réellement → Journal",
      },
    },
    ready: true,
  },
  {
    slug: "reading-candlesticks",
    section: "basics",
    title: {
      en: "Reading Japanese Candlesticks",
      ar: "قراءة الشموع اليابانية",
      fr: "Lire les chandeliers japonais",
    },
    summary: {
      en: "A diagram showing a bullish and bearish candle, with open, close, high, and low.",
      ar: "رسم يوضح شمعة صاعدة وهابطة مع الفتح والإغلاق والقمة والقاع.",
      fr: "Un schéma montrant une bougie haussière et baissière, avec ouverture, clôture, plus haut et plus bas.",
    },
    body: {
      en: `Every candle represents a fixed time period (an hour, a day...) and carries 4 pieces of information: the open price, the close, the highest point, and the lowest point.

A green (or white) candle means the close was higher than the open — buying pressure. A red candle means the opposite — selling pressure.

The body shows the distance between the open and close, while the wick shows the furthest point price reached before pulling back.`,
      ar: `كل شمعة تمثل فترة زمنية محددة (ساعة، يوم..) وتحمل 4 معلومات: سعر الافتتاح، الإغلاق، أعلى نقطة، وأدنى نقطة.

الشمعة الخضراء (أو البيضاء) تعني أن الإغلاق كان أعلى من الافتتاح — ضغط شراء. الشمعة الحمراء تعني العكس — ضغط بيع.

الجسم (Body) يوضح المسافة بين الفتح والإغلاق، والذيل (Wick) يوضح أقصى نقطة وصل إليها السعر قبل أن يرتد.`,
      fr: `Chaque bougie représente une période de temps fixe (une heure, un jour...) et porte 4 informations : le prix d'ouverture, la clôture, le point le plus haut et le point le plus bas.

Une bougie verte (ou blanche) signifie que la clôture était plus haute que l'ouverture — pression acheteuse. Une bougie rouge signifie l'inverse — pression vendeuse.

Le corps montre l'écart entre l'ouverture et la clôture, tandis que la mèche montre le point le plus extrême atteint par le prix avant qu'il ne revienne en arrière.`,
    },
    diagramId: "reading-candlesticks",
    linkedTool: {
      name: "Analyzer",
      href: "/analyzer",
      ctaText: {
        en: "Try reading a real chart now → Analyzer",
        ar: "جرّب قراءة شارت حقيقي الآن → Analyzer",
        fr: "Essayez de lire un vrai graphique maintenant → Analyzer",
      },
    },
    ready: true,
  },
  {
    slug: "trend-direction",
    section: "basics",
    title: {
      en: "Trend Direction",
      ar: "الاتجاه العام (Trend)",
      fr: "Direction de la tendance",
    },
    summary: {
      en: "A diagram showing an uptrend, downtrend, and sideways trend.",
      ar: "رسم يوضح اتجاهًا صاعدًا وهابطًا وعرضيًا (sideways).",
      fr: "Un schéma montrant une tendance haussière, baissière et latérale.",
    },
    body: {
      en: `An uptrend is made up of progressively higher highs and higher lows. A downtrend is the opposite — progressively lower highs and lower lows.

A sideways trend means price is moving within a defined range with no clear direction — usually a weaker opportunity to trade.

Trading with the overall trend is easier and lower-risk than trying to predict its reversal — the common rule is: "the trend is your friend until it breaks."`,
      ar: `الاتجاه الصاعد يتكون من قمم وقيعان مرتفعة تدريجياً. الاتجاه الهابط هو العكس — قمم وقيعان منخفضة تدريجياً.

الاتجاه العرضي (Sideways) يعني أن السعر يتحرك بين نطاق محدد بدون اتجاه واضح — غالباً فرصة أضعف للتداول.

التداول مع الاتجاه العام أسهل وأقل مخاطرة من محاولة التنبؤ بانعكاسه — القاعدة الشائعة: "الاتجاه صديقك حتى ينكسر."`,
      fr: `Une tendance haussière se compose de sommets et de creux de plus en plus hauts. Une tendance baissière est l'inverse — des sommets et des creux de plus en plus bas.

Une tendance latérale signifie que le prix évolue dans une fourchette définie sans direction claire — généralement une opportunité de trading plus faible.

Trader dans le sens de la tendance générale est plus facile et moins risqué que d'essayer de prédire son renversement — la règle courante est : « la tendance est votre amie jusqu'à ce qu'elle se brise ».`,
    },
    diagramId: "trend-direction",
    linkedTool: {
      name: "Radar",
      href: "/radar",
      ctaText: {
        en: "See which coins are trending up right now → Radar",
        ar: "شاهد أي العملات في اتجاه صاعد الآن → Radar",
        fr: "Découvrez quelles cryptos sont en tendance haussière → Radar",
      },
    },
    ready: true,
  },

  // ───────── Technical ─────────
  {
    slug: "support-resistance",
    section: "technical",
    title: {
      en: "Support & Resistance",
      ar: "الدعم والمقاومة",
      fr: "Support et résistance",
    },
    summary: {
      en: "Why price repeatedly stalls at the same levels, and why resistance turns into support after a breakout.",
      ar: "لماذا يتوقف السعر بشكل متكرر عند نفس المستويات، ولماذا تتحول المقاومة إلى دعم بعد الاختراق.",
      fr: "Pourquoi le prix s'arrête de façon répétée aux mêmes niveaux, et pourquoi la résistance devient un support après une cassure.",
    },
    body: {
      en: `Resistance is a price level where the rise repeatedly stalls because sellers dominate there. Support is the opposite — a level where the decline stalls because buyers step in with strength.

The more times price bounces off the same level, the stronger and more reliable that level becomes.

When price breaks resistance with real strength, it often flips into new support — and that's exactly what the Analyzer tool looks for when identifying entry points.`,
      ar: `المقاومة هي مستوى سعري يتوقف عنده الصعود بشكل متكرر لأن البائعين يسيطرون هناك. الدعم هو العكس — مستوى يتوقف عنده الهبوط لأن المشترين يدخلون بقوة.

كلما ارتد السعر عن نفس المستوى مرات أكثر، كلما أصبح ذلك المستوى أقوى وأكثر موثوقية.

عندما يخترق السعر المقاومة بقوة، فإنها غالبًا تتحول إلى دعم جديد — وهذا بالضبط ما تبحث عنه أداة Analyzer عند تحديد نقاط الدخول.`,
      fr: `La résistance est un niveau de prix où la hausse s'arrête de façon répétée parce que les vendeurs y dominent. Le support est l'inverse — un niveau où la baisse s'arrête parce que les acheteurs entrent avec force.

Plus le prix rebondit sur le même niveau, plus ce niveau devient fort et fiable.

Lorsque le prix casse la résistance avec une vraie force, elle se transforme souvent en nouveau support — c'est exactement ce que l'outil Analyseur recherche pour identifier les points d'entrée.`,
    },
    diagramId: "support-resistance",
    linkedTool: {
      name: "Analyzer",
      href: "/analyzer",
      ctaText: {
        en: "Try this concept on a real chart now → Analyzer",
        ar: "جرّب المفهوم على شارت حقيقي الآن → Analyzer",
        fr: "Essayez ce concept sur un vrai graphique → Analyzer",
      },
    },
    ready: true,
  },
  {
    slug: "breakout-retest",
    section: "technical",
    title: {
      en: "Breakout & Retest",
      ar: "الاختراق وإعادة الاختبار",
      fr: "Cassure et retest",
    },
    summary: {
      en: "A level breaks, then price returns to test it as new support before continuing.",
      ar: "اختراق مستوى، ثم عودة السعر لاختباره كدعم جديد قبل الاستمرار.",
      fr: "Un niveau est cassé, puis le prix revient le tester comme nouveau support avant de poursuivre.",
    },
    body: {
      en: `When price breaks a resistance level with real strength (a large candle, high volume), that's a breakout. But entering immediately at the breakout is risky — many breakouts turn out to be fakeouts.

The safer approach is waiting for a "retest" — price returning to the exact level it broke, and bouncing upward off it instead of falling back below. This confirms the level has genuinely flipped from resistance into support.

This is exactly what the Analyzer tool looks for when classifying a setup as "ready now" instead of a "pending plan."`,
      ar: `عندما يكسر السعر مستوى مقاومة بقوة (بشمعة كبيرة وحجم تداول مرتفع)، فهذا اختراق. لكن الدخول المباشر عند الاختراق خطر — كثير من الاختراقات تكون كاذبة (Fakeout).

الأسلم هو انتظار "إعادة الاختبار" — أن يعود السعر لنفس المستوى الذي كسره، ويرتد عنه صعوداً بدل أن يعود تحته. هذا يؤكد أن المستوى تحول من مقاومة إلى دعم فعلي.

هذا بالضبط ما تبحث عنه أداة Analyzer عند تصنيف فرصة كـ "جاهزة الآن" بدل "خطة معلّقة."`,
      fr: `Lorsque le prix casse un niveau de résistance avec une vraie force (une grande bougie, un volume élevé), c'est une cassure. Mais entrer immédiatement à la cassure est risqué — beaucoup de cassures s'avèrent être de fausses cassures (fakeout).

La méthode la plus sûre est d'attendre un « retest » — que le prix revienne exactement au niveau cassé, et rebondisse vers le haut au lieu de repasser en dessous. Cela confirme que le niveau s'est réellement transformé de résistance en support.

C'est exactement ce que l'outil Analyseur recherche pour classer une configuration comme « prête maintenant » plutôt que « plan en attente ».`,
    },
    diagramId: "breakout-retest",
    linkedTool: {
      name: "Analyzer",
      href: "/analyzer",
      ctaText: {
        en: "See how the Analyzer identifies real breakouts → Analyzer",
        ar: "شاهد كيف يحدد الـ Analyzer الاختراقات الحقيقية → Analyzer",
        fr: "Découvrez comment l'Analyseur identifie les vraies cassures → Analyzer",
      },
    },
    ready: true,
  },
  {
    slug: "relative-strength-btc",
    section: "technical",
    title: {
      en: "Relative Strength vs. BTC",
      ar: "القوة النسبية مقابل BTC",
      fr: "Force relative face au BTC",
    },
    summary: {
      en: "When a coin outperforms Bitcoin, and why that matters.",
      ar: "متى تتفوق عملة على البيتكوين، ولماذا يهم ذلك.",
      fr: "Quand une crypto surperforme le Bitcoin, et pourquoi c'est important.",
    },
    body: {
      en: `Not every coin moves with the same strength. A coin that rises 5% while BTC only rises 2% is "relatively stronger" — a good sign that traders are specifically interested in that coin.

The opposite matters too: a coin that falls more than BTC in a down market signals genuine weakness, not just normal volatility.

The "Beating BTC" filter in Radar tracks this automatically across every USDT pair, instead of you following each one manually.`,
      ar: `ليست كل العملات تتحرك بنفس القوة. عملة ترتفع 5% بينما BTC يرتفع 2% فقط تكون "أقوى نسبياً" — وهذا مؤشر جيد على اهتمام المتداولين بها تحديداً.

العكس أيضاً مهم: عملة تنخفض أكثر من BTC في سوق هابط تدل على ضعف حقيقي، لا تقلب عادي.

فلتر "Beating BTC" في Radar يرصد هذا تلقائياً على كل أزواج USDT، بدل أن تتابعها يدوياً واحدة تلو الأخرى.`,
      fr: `Toutes les cryptos ne bougent pas avec la même force. Une crypto qui monte de 5 % pendant que le BTC ne monte que de 2 % est « relativement plus forte » — bon signe que les traders s'intéressent spécifiquement à elle.

L'inverse compte aussi : une crypto qui baisse plus que le BTC dans un marché baissier signale une vraie faiblesse, pas une simple fluctuation normale.

Le filtre « Bat BTC » dans Radar repère cela automatiquement sur chaque paire USDT, au lieu que vous les suiviez une par une manuellement.`,
    },
    diagramId: "relative-strength-btc",
    linkedTool: {
      name: "Radar",
      href: "/radar",
      ctaText: {
        en: "See which coins are beating BTC right now → Radar",
        ar: "شاهد أي العملات تتفوق على BTC الآن → Radar",
        fr: "Découvrez quelles cryptos battent le BTC en ce moment → Radar",
      },
    },
    ready: true,
  },

  // ───────── Risk ─────────
  {
    slug: "risk-percentage",
    section: "risk",
    title: {
      en: "Why Risk Percentage Matters More Than Prediction Accuracy",
      ar: "لماذا نسبة المخاطرة أهم من دقة التوقع",
      fr: "Pourquoi le pourcentage de risque compte plus que la précision des prévisions",
    },
    summary: {
      en: "How high risk per trade can wipe out an account even with a good win rate.",
      ar: "كيف تؤدي المخاطرة العالية إلى تصفية الحساب حتى مع نسبة نجاح جيدة.",
      fr: "Comment un risque élevé par trade peut ruiner un compte même avec un bon taux de réussite.",
    },
    body: {
      en: `A trader who wins 70% of their trades but risks 20% of their account on each one will eventually blow up their account — just two losing trades in a row is enough for a large loss that's hard to recover from.

Another trader who only wins 40% of trades but risks just 1% per trade can keep going for years, even through a long losing streak.

Staying in the market matters more than fast profits — and that starts with a small, fixed risk percentage, not confidence in any particular prediction.`,
      ar: `متداول يصيب 70% من صفقاته لكنه يخاطر بـ 20% من حسابه في كل صفقة سيصفّي حسابه عاجلاً — صفقتان خاسرتان متتاليتان فقط تكفي لخسارة كبيرة يصعب تعويضها.

متداول آخر يصيب 40% فقط لكنه يخاطر بـ 1% فقط لكل صفقة يمكنه الاستمرار لسنوات حتى مع سلسلة خسائر طويلة.

البقاء في السوق أهم من الربح السريع — وهذا يبدأ بنسبة مخاطرة صغيرة وثابتة، لا بالثقة في توقع معين.`,
      fr: `Un trader qui réussit 70 % de ses trades mais risque 20 % de son compte à chaque fois finira par le faire exploser — seulement deux trades perdants d'affilée suffisent pour une grosse perte difficile à récupérer.

Un autre trader qui ne réussit que 40 % de ses trades mais ne risque que 1 % par trade peut continuer pendant des années, même en traversant une longue série de pertes.

Rester sur le marché compte plus que des profits rapides — et cela commence par un pourcentage de risque petit et fixe, pas par la confiance en une prévision particulière.`,
    },
    diagramId: "risk-percentage",
    linkedTool: {
      name: "Risk",
      href: "/risk",
      ctaText: {
        en: "Calculate your risk percentage before your next trade → Risk",
        ar: "احسب نسبة مخاطرتك الآن قبل الصفقة القادمة → Risk",
        fr: "Calculez votre pourcentage de risque avant votre prochain trade → Risk",
      },
    },
    ready: true,
  },
  {
    slug: "stop-loss",
    section: "risk",
    title: {
      en: "Stop-Loss",
      ar: "وقف الخسارة (Stop-loss)",
      fr: "Stop-loss",
    },
    summary: {
      en: "Why every position needs a clear stop-loss level below the entry point.",
      ar: "لماذا يحتاج كل مركز إلى خط وقف خسارة واضح تحت نقطة الدخول.",
      fr: "Pourquoi chaque position a besoin d'un niveau de stop-loss clair sous le point d'entrée.",
    },
    body: {
      en: `A stop-loss is a pre-set order that automatically closes a trade if price moves against you by a certain distance — protecting your capital from unlimited loss if the market moves opposite to what you expected.

A stop-loss should be placed at a point that proves the trade idea was actually wrong — for example, below the nearest swing low or support level — not at some random distance that just "feels comfortable."

Trading without a stop-loss is the number one cause of blown accounts, even when the idea was mostly right.`,
      ar: `وقف الخسارة هو أمر مسبق يُغلق الصفقة تلقائياً إذا تحرك السعر ضدك لمسافة معينة — يحمي رأس المال من خسارة غير محدودة إذا تحرك السوق بعكس توقعك.

يوضع وقف الخسارة عند نقطة تُثبت أن فكرة الصفقة أصلاً خاطئة — مثلاً تحت أقرب قاع أو مستوى دعم — لا عند مسافة عشوائية "تشعرك بالراحة."

التداول بدون وقف خسارة هو السبب الأول لتصفية الحسابات، حتى لو كانت الفكرة صحيحة في الأغلب.`,
      fr: `Un stop-loss est un ordre préétabli qui ferme automatiquement un trade si le prix évolue contre vous sur une certaine distance — protégeant votre capital d'une perte illimitée si le marché évolue à l'opposé de ce que vous attendiez.

Le stop-loss doit être placé à un point qui prouve que l'idée de trade était réellement erronée — par exemple sous le creux ou le niveau de support le plus proche — pas à une distance aléatoire qui vous « semble confortable ».

Trader sans stop-loss est la première cause de comptes ruinés, même quand l'idée était globalement correcte.`,
    },
    diagramId: "stop-loss",
    linkedTool: {
      name: "Risk",
      href: "/risk",
      ctaText: {
        en: "Enter your numbers and get a calculated stop-loss level → Risk",
        ar: "أدخل بياناتك واحصل على مستوى وقف خسارة محسوب → Risk",
        fr: "Entrez vos chiffres et obtenez un niveau de stop-loss calculé → Risk",
      },
    },
    ready: true,
  },
  {
    slug: "position-sizing",
    section: "risk",
    title: {
      en: "Position Sizing",
      ar: "حساب حجم الصفقة",
      fr: "Dimensionnement de la position",
    },
    summary: {
      en: "The relationship between account size, risk percentage, and stop-loss distance.",
      ar: "العلاقة بين حجم الحساب، نسبة المخاطرة، والمسافة لوقف الخسارة.",
      fr: "La relation entre la taille du compte, le pourcentage de risque et la distance du stop-loss.",
    },
    body: {
      en: `The correct position size isn't picked at random — it's calculated from 3 numbers: your account size, your allowed risk percentage (e.g. 1%), and the distance between your entry point and your stop-loss.

The larger that stop-loss distance is, the smaller your position size needs to be — to keep that same fixed risk percentage constant.

This is exactly the calculation the Risk calculator does automatically, instead of you guessing the size yourself every time.`,
      ar: `حجم الصفقة الصحيح لا يُحدَّد عشوائياً — بل يُحسب من 3 أرقام: حجم حسابك، نسبة المخاطرة المسموحة (مثلاً 1%)، والمسافة بين نقطة الدخول ووقف الخسارة.

كلما كانت المسافة لوقف الخسارة أكبر، كلما وجب أن يكون حجم الصفقة أصغر — للحفاظ على نفس نسبة المخاطرة الثابتة.

هذا الحساب هو ما يفعله حاسبة Risk تلقائياً، بدل أن تخمّن الحجم بنفسك في كل مرة.`,
      fr: `La bonne taille de position ne se choisit pas au hasard — elle se calcule à partir de 3 chiffres : la taille de votre compte, le pourcentage de risque autorisé (par exemple 1 %), et la distance entre votre point d'entrée et votre stop-loss.

Plus cette distance de stop-loss est grande, plus votre taille de position doit être petite — pour garder ce même pourcentage de risque fixe.

C'est exactement le calcul que fait automatiquement la calculatrice Risk, au lieu que vous deviniez la taille vous-même à chaque fois.`,
    },
    diagramId: "position-sizing",
    linkedTool: {
      name: "Risk",
      href: "/risk",
      ctaText: {
        en: "Let the calculator determine your next position size → Risk",
        ar: "دع الحاسبة تحدد حجم صفقتك القادمة → Risk",
        fr: "Laissez la calculatrice déterminer la taille de votre prochaine position → Risk",
      },
    },
    ready: true,
  },
  {
    slug: "trade-plan-checklist",
    section: "risk",
    title: {
      en: "The Trade Plan Before Entry",
      ar: "خطة التداول قبل الدخول",
      fr: "Le plan de trade avant l'entrée",
    },
    summary: {
      en: "The elements of a plan: entry point, target, stop-loss, and R:R ratio.",
      ar: "عناصر الخطة: نقطة الدخول، الهدف، وقف الخسارة، ونسبة R:R.",
      fr: "Les éléments d'un plan : point d'entrée, objectif, stop-loss et ratio R:R.",
    },
    body: {
      en: `A good trade is planned before entry, not after. The plan includes: the entry point, the target (or targets), the stop-loss, and the risk-to-reward ratio (R:R).

Writing these elements down before entering prevents you from changing your decision under emotional pressure while price swings during the trade.

The R:R ratio usually shouldn't be lower than 1:2 — meaning the potential gain is at least double the potential loss — so the system stays profitable over the long run despite individual losses.`,
      ar: `الصفقة الجيدة تُخطَّط قبل الدخول، لا بعده. الخطة تشمل: نقطة الدخول، الهدف (أو الأهداف)، وقف الخسارة، ونسبة المخاطرة إلى المكسب (R:R).

كتابة هذه العناصر قبل الدخول تمنعك من تغيير القرار تحت تأثير العاطفة وسط تقلب السعر لحظة الصفقة.

نسبة R:R لا تقل عادة عن 1:2 — أي أن المكسب المحتمل ضعف الخسارة المحتملة على الأقل، حتى يكون النظام مربحاً على المدى الطويل رغم الخسائر الفردية.`,
      fr: `Un bon trade se planifie avant l'entrée, pas après. Le plan comprend : le point d'entrée, l'objectif (ou les objectifs), le stop-loss, et le ratio risque/récompense (R:R).

Écrire ces éléments avant d'entrer vous empêche de changer de décision sous le coup de l'émotion pendant que le prix fluctue en plein trade.

Le ratio R:R ne doit généralement pas être inférieur à 1:2 — c'est-à-dire que le gain potentiel est au moins le double de la perte potentielle, pour que le système reste rentable sur le long terme malgré les pertes individuelles.`,
    },
    diagramId: "trade-plan-checklist",
    linkedTool: {
      name: "Trade Plan",
      href: "/trade-plan",
      ctaText: {
        en: "Write your plan before your next trade → Trade Plan",
        ar: "اكتب خطتك قبل الصفقة القادمة → Trade Plan",
        fr: "Rédigez votre plan avant votre prochain trade → Trade Plan",
      },
    },
    ready: true,
  },

  // ───────── Habits ─────────
  {
    slug: "fomo",
    section: "habits",
    title: {
      en: "Fear of Missing Out (FOMO)",
      ar: "خوف فوات الفرصة (FOMO)",
      fr: "La peur de rater une opportunité (FOMO)",
    },
    summary: {
      en: "Entering late after a sharp rise, followed by a correction.",
      ar: "دخول متأخر بعد صعود حاد، ثم تصحيح.",
      fr: "Entrer tardivement après une forte hausse, suivie d'une correction.",
    },
    body: {
      en: `FOMO happens when you see a coin that's risen fast and you enter late, driven by "I don't want to miss this" — usually near the end of the move, not the beginning.

Entering at that moment means buying near the very top, right before the natural correction that follows every sharp rise.

The solution isn't to ignore every strong move — it's to wait for a sensible entry point (like a retest) instead of chasing price immediately.`,
      ar: `FOMO يحدث عندما ترى عملة ارتفعت بسرعة وتدخل متأخراً بدافع "لا أريد أن أفوّت الفرصة" — غالباً قرب نهاية الحركة، لا بدايتها.

الدخول في هذه اللحظة يعني شراء عند أعلى نقطة تقريباً، تماماً قبل التصحيح الطبيعي الذي يتبع كل صعود حاد.

الحل ليس تجاهل كل حركة قوية، بل انتظار نقطة دخول منطقية (كإعادة اختبار) بدل الانطلاق فوراً خلف السعر.`,
      fr: `Le FOMO survient quand vous voyez une crypto qui a monté rapidement et que vous entrez en retard, poussé par « je ne veux pas rater ça » — généralement vers la fin du mouvement, pas au début.

Entrer à ce moment-là revient à acheter proche du sommet, juste avant la correction naturelle qui suit toute forte hausse.

La solution n'est pas d'ignorer chaque mouvement fort, mais d'attendre un point d'entrée raisonnable (comme un retest) au lieu de courir immédiatement après le prix.`,
    },
    diagramId: "fomo",
    linkedTool: {
      name: "Analyzer",
      href: "/analyzer",
      ctaText: {
        en: "Find out if this is a real entry or one you've already missed → Analyzer",
        ar: "اعرف إن كانت اللحظة مناسبة للدخول أم فائتة → Analyzer",
        fr: "Découvrez si c'est une vraie entrée ou une occasion déjà ratée → Analyzer",
      },
    },
    ready: true,
  },
  {
    slug: "trading-journal-habit",
    section: "habits",
    title: {
      en: "The Importance of a Trading Journal",
      ar: "أهمية اليوميات",
      fr: "L'importance du journal de trading",
    },
    summary: {
      en: "The cycle: plan → execute → log → review → improve.",
      ar: "دورة: خطة → تنفيذ → تسجيل → مراجعة → تحسين.",
      fr: "Le cycle : planifier → exécuter → enregistrer → revoir → améliorer.",
    },
    body: {
      en: `The professional trading cycle runs through 4 repeating steps: plan → execute → log → review. Most traders stop at execution and never log or review at all.

Without logging, the same mistakes repeat without you noticing — exiting too early, ignoring your stop-loss, entering with no plan.

A journal turns trading from a random experience into a system you can actually improve, because you clearly see what's working and what keeps failing.`,
      ar: `دورة التداول المحترف تمر بـ 4 خطوات متكررة: خطة → تنفيذ → تسجيل → مراجعة. أغلب المتداولين يتوقفون عند التنفيذ ولا يسجّلون أو يراجعون أبداً.

بدون تسجيل، تتكرر نفس الأخطاء دون أن تلاحظها — الخروج المبكر، تجاهل وقف الخسارة، الدخول بدون خطة.

اليوميات تحوّل التداول من تجربة عشوائية إلى نظام قابل للتحسين، لأنك ترى بوضوح ما ينجح وما يتكرر فشله.`,
      fr: `Le cycle du trading professionnel passe par 4 étapes répétées : planifier → exécuter → enregistrer → revoir. La plupart des traders s'arrêtent à l'exécution et n'enregistrent ni ne revoient jamais.

Sans enregistrement, les mêmes erreurs se répètent sans que vous le remarquiez — sortie trop précoce, stop-loss ignoré, entrée sans plan.

Le journal transforme le trading d'une expérience aléatoire en un système que vous pouvez réellement améliorer, car vous voyez clairement ce qui fonctionne et ce qui échoue constamment.`,
    },
    diagramId: "trading-journal-habit",
    linkedTool: {
      name: "Journal",
      href: "/journal",
      ctaText: {
        en: "Start logging your trades right now → Journal",
        ar: "ابدأ تسجيل صفقاتك من الآن → Journal",
        fr: "Commencez à enregistrer vos trades dès maintenant → Journal",
      },
    },
    ready: true,
  },
  {
    slug: "signals-vs-understanding",
    section: "habits",
    title: {
      en: "Signals vs. Real Understanding",
      ar: "الإشارات مقابل الفهم الحقيقي",
      fr: "Signaux vs compréhension réelle",
    },
    summary: {
      en: "Why relying on understanding matters more than blindly copying signals.",
      ar: "لماذا الاعتماد على الفهم أهم من النسخ الأعمى للإشارات.",
      fr: "Pourquoi s'appuyer sur la compréhension compte plus que copier aveuglément des signaux.",
    },
    body: {
      en: `Relying completely on ready-made signals (from a channel or someone else) without understanding the reasoning leaves you unable to decide on your own, and unable to recognize when a signal has gone wrong.

Real understanding means you can evaluate any trade yourself — even one from a trusted source — instead of executing it blindly.

The goal of this site's sections isn't to replace your judgment, but to build an understanding you can use to evaluate any signal or opportunity, from any source.`,
      ar: `الاعتماد الكامل على إشارات جاهزة (من قناة أو شخص آخر) دون فهم السبب يجعلك عاجزاً عن اتخاذ القرار وحيداً، وعاجزاً عن معرفة متى تكون الإشارة خاطئة.

الفهم الحقيقي يعني أنك تستطيع تقييم أي صفقة بنفسك — حتى لو كانت الإشارة من مصدر موثوق — بدل تنفيذها بشكل أعمى.

الهدف من أقسام هذا الموقع ليس استبدال حكمك، بل بناء فهم تستخدمه لتقييم أي إشارة أو فرصة تصلك من أي مصدر.`,
      fr: `Se fier entièrement à des signaux tout faits (d'un canal ou d'une autre personne) sans en comprendre la logique vous rend incapable de décider seul, et incapable de reconnaître quand un signal a mal tourné.

Une vraie compréhension signifie que vous pouvez évaluer n'importe quel trade vous-même — même venant d'une source fiable — au lieu de l'exécuter aveuglément.

L'objectif des sections de ce site n'est pas de remplacer votre jugement, mais de construire une compréhension que vous utiliserez pour évaluer n'importe quel signal ou opportunité, peu importe sa source.`,
    },
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
