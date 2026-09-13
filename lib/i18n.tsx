"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "ar";

type Dict = { [key: string]: string | Dict };

const en: Dict = {
  nav: {
    radar: "Radar",
    analyzer: "Analyzer",
    ticker: "Ticker",
    journal: "Journal",
    risk: "Risk",
  },
  home: {
    heroTitle: "Read the chart before you risk the trade.",
    heroLine1: "Read the market.",
    heroLine2: "Plan the trade.",
    heroLine3: "Control the risk.",
    heroBody:
      "AI-powered chart analysis and trading tools built to help crypto traders make better decisions — every USDT pair on Binance, free.",
    openAnalyzer: "Open analyzer",
    viewMarket: "View live market",
    liveMarket: "Live market",
    ctaAnalyze: "Analyze your chart",
    ctaExplore: "Explore markets",
    exampleLabel: "Example",
    demoSupport: "Support",
    demoResistance: "Resistance",
    demoWatch: "Reclaim above $64,800",
    snapshotTitle: "Live market snapshot",
    showcase: {
      analyzerTitle: "AI chart analyzer",
      analyzerBody:
        "Upload a screenshot and Atlas reads structure, trend, key levels, and scenarios — then turns it into a plan, not a guess.",
      step1: "Upload chart",
      step2: "Market structure",
      step3: "Scenarios",
      step4: "Trade plan",
      radarTitle: "Market Radar",
      radarBody: "A shortlist of coins worth investigating right now — not 500 coins to sift through yourself.",
      radarCta: "Open Radar",
      riskTitle: "Risk calculator",
      riskBody: "Fix your risk per trade, let position size follow your stop — not the other way around.",
      journalTitle: "Journal",
      journalBody: "Log every trade and see, in real numbers, why you're winning or losing.",
    },
    workflow: {
      title: "The Atlas workflow",
      discover: "Discover",
      analyze: "Analyze",
      plan: "Plan",
      control: "Control",
      review: "Review",
      improve: "Improve",
    },
    features: {
      freeTitle: "Actually free",
      freeBody:
        "No account, no card, no trial period. Ticker, journal, and risk calculator cost nothing to use, ever.",
      liveTitle: "Live, not delayed",
      liveBody:
        "Prices stream straight from Binance's public API — the same data you'd see on the exchange itself.",
      deviceTitle: "On your device",
      deviceBody:
        "Your journal stays in your browser. No account required, nothing synced to a server you don't control.",
      aiTitle: "AI-read charts",
      aiBody:
        "Upload a screenshot and get a structured read — bias, key level, invalidation, plan — in seconds.",
      pairsTitle: "Every USDT pair",
      pairsBody:
        "Not just BTC and ETH — the ticker and analyzer work across everything Binance lists.",
      communityTitle: "A real community",
      communityBody:
        "Free public group for discussion, plus a closer VIP line for higher-conviction calls.",
    },
    tools: {
      radarTitle: "Market Radar",
      radarBody:
        "Screen every USDT pair by volume, breakout, pullback, and performance vs BTC — a shortlist, not 1,000 coins.",
      analyzerTitle: "Analyzer",
      analyzerBody:
        "Drop in a screenshot of your chart and get a plain-language read on structure, levels, and invalidation.",
      journalTitle: "Journal",
      journalBody:
        "Log entries, stops, and outcomes per pair. Stored on your device — no account needed for the free tier.",
      riskTitle: "Risk calculator",
      riskBody:
        "Enter your account size and stop distance, get a position size that keeps risk per trade fixed.",
    },
    community: {
      freeLabel: "Free",
      freeTitle: "Community group",
      freeBody:
        "Public calls, market discussion, and updates on the tools here. Anyone can join instantly.",
      joinFree: "Join free group",
      vipLabel: "ATLAS ELITE",
      vipTitle: "Premium trade setups & management",
      vipBody:
        "Higher-conviction calls and closer access. By request — message directly to get set up.",
      contactVip: "Join Atlas Elite",
    },
    faq: {
      heading: "Common questions",
      q1: "Is this financial advice?",
      a1: "No. The analyzer, journal, and risk calculator are tools to check your own thinking against — none of it is a recommendation to buy or sell anything.",
      q2: "Is it really free?",
      a2: "Yes — the ticker, journal, and risk calculator have no cost, no account, and no trial period. The analyzer runs on a free-tier AI model, so it's free to use within normal daily limits.",
      q3: "Do I need to create an account?",
      a3: "No. Everything runs in your browser. Your journal is stored on your device only, not on a server.",
      q4: "What's the difference between the free group and VIP?",
      a4: "The free group is open discussion and public updates. VIP is closer access and higher-conviction calls — message directly on Telegram to get set up.",
    },
  },
  footer: {
    disclaimer:
      "Not financial advice. Every read and tool here is for checking your own thinking, not replacing it.",
    joinFree: "Join the free group →",
    contactVip: "Contact for VIP access →",
  },
  ticker: {
    title: "Live market",
    subtitle: "Every USDT pair on Binance",
    symbols: "symbols",
    refreshes: "refreshes every 15s",
    searchPlaceholder: "Search pair, e.g. BTC",
    error: "Couldn't reach Binance right now. Retrying shortly.",
    pair: "Pair",
    lastPrice: "Last price",
    high: "24h high",
    low: "24h low",
    change: "24h change",
    volume: "24h volume",
    loading: "Loading market data…",
    showingTop: "Showing top 100 of",
    bySort: "by current sort.",
  },
  risk: {
    title: "Risk calculator",
    subtitle:
      "Fix your risk per trade, let the position size follow your stop — not the other way around.",
    balance: "Account balance (USDT)",
    riskPct: "Risk per trade (%)",
    side: "Side",
    long: "Long",
    short: "Short",
    entry: "Entry price",
    stop: "Stop-loss price",
    target: "Take-profit price (optional)",
    empty: "Enter your balance, risk %, entry, and stop to see position size.",
    risking: "Risking",
    positionSize: "Position size",
    units: "units",
    notional: "Notional value",
    rewardRisk: "Reward : risk",
    addTarget: "— add a target",
    invalid: "Check your levels — the stop or target isn't on the correct side of entry for a",
  },
  journal: {
    title: "Journal",
    subtitle: "Saved on this device only, for the free tier. Export anytime.",
    exportCsv: "Export CSV",
    pairPlaceholder: "Pair, e.g. BTCUSDT",
    entryPlaceholder: "Entry",
    stopPlaceholder: "Stop",
    targetPlaceholder: "Target",
    sizePlaceholder: "Size (units)",
    exitPlaceholder: "Exit (leave blank if open)",
    notesPlaceholder: "Notes — setup, reasoning, what happened",
    logTrade: "Log trade",
    date: "Date",
    pair: "Pair",
    side: "Side",
    entry: "Entry",
    stop: "Stop",
    exit: "Exit",
    pnl: "PnL",
    noTrades: "No trades logged yet.",
    open: "Open",
    remove: "Remove",
  },
  analyzer: {
    title: "Chart analyzer",
    subtitle:
      "Upload a TradingView or exchange screenshot for any pair. Precision over prediction — a structural read to check your own thinking against, not financial advice.",
    dragHere: "Drag a chart screenshot here, or",
    chooseFile: "Choose file",
    readingChart: "Reading chart…",
    analyzeChart: "Analyze chart",
    pairLabel: "Pair",
    timeframeLabel: "Timeframe",
    styleLabel: "Trading style",
    autoDetect: "Auto-detect",
    style: {
      spotSwing: "Spot swing",
      dayTrade: "Day trade",
      scalping: "Scalping",
      learning: "Learning",
    },
    marketStructure: "Market structure",
    trend: "Trend",
    momentum: "Momentum",
    keyLevels: "Key levels",
    currentCondition: "Current condition",
    noClearSetup: "No clear setup",
    bullishScenario: "🟢 Bullish scenario",
    bearishScenario: "🔴 Bearish scenario",
    confirmation: "Confirmation",
    targets: "Potential targets",
    why: "Why",
    whatToWatch: "What to watch",
    invalidation: "Invalidation",
    invalidationShort: "Invalidation",
    tradePlan: "Atlas trade plan",
    direction: "Direction",
    entryZone: "Entry zone",
    precisionNote:
      "Atlas never invents probabilities, guaranteed targets, or indicator values it can't see — only conditional, structure-based reads. It will say \"wait\" when there's no clean setup.",
    genericError: "Something went wrong.",
    connectionError: "Couldn't reach the analyzer. Check your connection and try again.",
  },
  radar: {
    title: "Market Radar",
    subtitle:
      "A shortlist, not a scoreboard — screens every USDT pair on Binance by clear, disclosed rules. No hidden scoring.",
    loading: "Scanning the market…",
    error: "Couldn't reach Binance right now. Retrying shortly.",
    empty: "No pairs match this filter right now.",
    pair: "Pair",
    price: "Price",
    change24h: "24h change",
    vsBtc: "vs BTC",
    volume: "24h volume",
    tags: "Tags",
    filterAll: "All",
    filterVolume: "High volume",
    filterBreakout: "Breakout",
    filterPullback: "Pullback",
    filterNearHigh: "Near 24h high",
    filterNearLow: "Near 24h low",
    filterOutperform: "Beating BTC",
    tag: {
      breakout: "Breakout",
      pullback: "Pullback",
      highVolume: "High volume",
      nearHigh: "Near high",
      nearLow: "Near low",
      outperformBtc: "Beating BTC",
      underperformBtc: "Lagging BTC",
    },
    disclaimer:
      "Rules, not magic: Breakout = within 1% of the 24h high and green. Pullback = up 3%+ over 24h but at least 3% off that high. High volume = top 40 pairs by 24h quote volume. Near high/low = within 1% of the 24h high/low. vs BTC = this pair's 24h change minus BTC's 24h change, in percentage points. This is a screen to narrow your own research, not a signal to trade.",
  },
};

const ar: Dict = {
  nav: {
    radar: "الرادار",
    analyzer: "المحلل",
    ticker: "الأسعار",
    journal: "السجل",
    risk: "حاسبة المخاطر",
  },
  home: {
    heroTitle: "اقرأ الشارت قبل أن تخاطر بالصفقة.",
    heroLine1: "اقرأ السوق.",
    heroLine2: "خطّط للصفقة.",
    heroLine3: "تحكّم بالمخاطرة.",
    heroBody:
      "تحليل شارت مدعوم بالذكاء الاصطناعي وأدوات تداول مصممة لمساعدة متداولي الكريبتو على اتخاذ قرارات أفضل — كل أزواج USDT على Binance، مجانًا.",
    openAnalyzer: "افتح المحلل",
    viewMarket: "عرض السوق المباشر",
    liveMarket: "السوق المباشر",
    ctaAnalyze: "حلّل شارتك",
    ctaExplore: "استكشف الأسواق",
    exampleLabel: "مثال",
    demoSupport: "الدعم",
    demoResistance: "المقاومة",
    demoWatch: "استعادة ما فوق $64,800",
    snapshotTitle: "لمحة السوق المباشرة",
    showcase: {
      analyzerTitle: "محلل الشارت بالذكاء الاصطناعي",
      analyzerBody:
        "ارفع صورة ويقرأ أطلس البنية والاتجاه والمستويات الرئيسية والسيناريوهات — ثم يحوّلها إلى خطة، لا تخمين.",
      step1: "ارفع الشارت",
      step2: "بنية السوق",
      step3: "السيناريوهات",
      step4: "خطة الصفقة",
      radarTitle: "رادار السوق",
      radarBody: "قائمة مختصرة بالعملات الجديرة بالاهتمام الآن — لا 500 عملة عليك تصفحها بنفسك.",
      radarCta: "افتح الرادار",
      riskTitle: "حاسبة المخاطر",
      riskBody: "ثبّت مخاطرتك لكل صفقة، ودع حجم الصفقة يتبع وقف الخسارة — وليس العكس.",
      journalTitle: "السجل",
      journalBody: "سجّل كل صفقة وشاهد، بأرقام حقيقية، لماذا تربح أو تخسر.",
    },
    workflow: {
      title: "منهجية أطلس",
      discover: "اكتشف",
      analyze: "حلّل",
      plan: "خطّط",
      control: "تحكّم",
      review: "راجع",
      improve: "طوّر",
    },
    features: {
      freeTitle: "مجاني بالكامل",
      freeBody:
        "بدون حساب، بدون بطاقة، بدون فترة تجريبية. الأسعار والسجل وحاسبة المخاطر مجانية دائمًا.",
      liveTitle: "مباشر وليس متأخرًا",
      liveBody:
        "الأسعار تُبث مباشرة من واجهة Binance العامة — نفس البيانات التي تراها على المنصة نفسها.",
      deviceTitle: "على جهازك فقط",
      deviceBody:
        "سجل صفقاتك يبقى في متصفحك. لا حاجة لحساب، ولا شيء يُرسل إلى خادم لا تتحكم فيه.",
      aiTitle: "قراءة الشارت بالذكاء الاصطناعي",
      aiBody:
        "ارفع صورة للشارت واحصل على قراءة منظمة — الاتجاه، المستوى الرئيسي، نقطة الإبطال، والخطة — خلال ثوانٍ.",
      pairsTitle: "كل أزواج USDT",
      pairsBody:
        "ليس فقط BTC و ETH — الأسعار والمحلل يعملان على كل ما تدرجه Binance.",
      communityTitle: "مجتمع حقيقي",
      communityBody:
        "مجموعة عامة مجانية للنقاش، بالإضافة إلى خط VIP أقرب للتوصيات عالية الثقة.",
    },
    tools: {
      radarTitle: "رادار السوق",
      radarBody:
        "افحص كل أزواج USDT حسب الحجم والاختراق والارتداد والأداء مقابل BTC — قائمة مختصرة، لا 1000 عملة.",
      analyzerTitle: "المحلل",
      analyzerBody:
        "ارفع صورة لشارتك واحصل على قراءة واضحة للبنية والمستويات ونقطة الإبطال.",
      journalTitle: "السجل",
      journalBody:
        "سجّل صفقاتك ووقف الخسارة والنتائج لكل زوج. يُحفظ على جهازك — بدون حساب في النسخة المجانية.",
      riskTitle: "حاسبة المخاطر",
      riskBody:
        "أدخل حجم حسابك ومسافة وقف الخسارة، واحصل على حجم صفقة يحافظ على مخاطرة ثابتة.",
    },
    community: {
      freeLabel: "مجاني",
      freeTitle: "مجموعة المجتمع",
      freeBody:
        "توصيات عامة، نقاشات السوق، وتحديثات الأدوات هنا. يمكن لأي شخص الانضمام فورًا.",
      joinFree: "انضم للمجموعة المجانية",
      vipLabel: "ATLAS ELITE",
      vipTitle: "إعدادات صفقات مميزة وإدارتها",
      vipBody:
        "توصيات أعلى ثقة ووصول أقرب. بالطلب فقط — راسلنا مباشرة للانضمام.",
      contactVip: "انضم إلى Atlas Elite",
    },
    faq: {
      heading: "أسئلة شائعة",
      q1: "هل هذه نصيحة مالية؟",
      a1: "لا. المحلل والسجل وحاسبة المخاطر أدوات لمراجعة تفكيرك الخاص — وليست توصية بالشراء أو البيع.",
      q2: "هل هي مجانية فعلاً؟",
      a2: "نعم — الأسعار والسجل وحاسبة المخاطر بدون تكلفة، بدون حساب، وبدون فترة تجريبية. المحلل يعمل بنموذج ذكاء اصطناعي مجاني، لذا فهو مجاني ضمن الحدود اليومية المعتادة.",
      q3: "هل أحتاج لإنشاء حساب؟",
      a3: "لا. كل شيء يعمل في متصفحك. سجل صفقاتك يُحفظ على جهازك فقط، وليس على خادم.",
      q4: "ما الفرق بين المجموعة المجانية و VIP؟",
      a4: "المجموعة المجانية للنقاش العام والتحديثات. VIP وصول أقرب وتوصيات أعلى ثقة — راسلنا مباشرة على تيليجرام للانضمام.",
    },
  },
  footer: {
    disclaimer:
      "ليست نصيحة مالية. كل قراءة وأداة هنا لمراجعة تفكيرك الخاص، وليست بديلاً عنه.",
    joinFree: "انضم للمجموعة المجانية ←",
    contactVip: "تواصل للحصول على VIP ←",
  },
  ticker: {
    title: "السوق المباشر",
    subtitle: "كل أزواج USDT على Binance",
    symbols: "رمزًا",
    refreshes: "يتحدث كل 15 ثانية",
    searchPlaceholder: "ابحث عن زوج، مثل BTC",
    error: "تعذر الوصول إلى Binance الآن. ستتم إعادة المحاولة قريبًا.",
    pair: "الزوج",
    lastPrice: "آخر سعر",
    high: "أعلى 24 ساعة",
    low: "أدنى 24 ساعة",
    change: "تغير 24 ساعة",
    volume: "حجم 24 ساعة",
    loading: "جارٍ تحميل بيانات السوق…",
    showingTop: "عرض أفضل 100 من",
    bySort: "حسب الترتيب الحالي.",
  },
  risk: {
    title: "حاسبة المخاطر",
    subtitle: "ثبّت نسبة مخاطرتك لكل صفقة، ودع حجم الصفقة يتبع وقف الخسارة — وليس العكس.",
    balance: "رصيد الحساب (USDT)",
    riskPct: "نسبة المخاطرة لكل صفقة (%)",
    side: "الاتجاه",
    long: "شراء",
    short: "بيع",
    entry: "سعر الدخول",
    stop: "سعر وقف الخسارة",
    target: "سعر جني الأرباح (اختياري)",
    empty: "أدخل رصيدك ونسبة المخاطرة والدخول والوقف لرؤية حجم الصفقة.",
    risking: "المخاطرة بـ",
    positionSize: "حجم الصفقة",
    units: "وحدة",
    notional: "القيمة الاسمية",
    rewardRisk: "العائد : المخاطرة",
    addTarget: "— أضف هدفًا",
    invalid: "راجع مستوياتك — الوقف أو الهدف ليس في الجهة الصحيحة من الدخول بالنسبة لصفقة",
  },
  journal: {
    title: "السجل",
    subtitle: "يُحفظ على هذا الجهاز فقط في النسخة المجانية. يمكنك التصدير في أي وقت.",
    exportCsv: "تصدير CSV",
    pairPlaceholder: "الزوج، مثل BTCUSDT",
    entryPlaceholder: "الدخول",
    stopPlaceholder: "الوقف",
    targetPlaceholder: "الهدف",
    sizePlaceholder: "الحجم (وحدات)",
    exitPlaceholder: "الخروج (اتركه فارغًا إن كانت الصفقة مفتوحة)",
    notesPlaceholder: "ملاحظات — الإعداد، السبب، ما حدث",
    logTrade: "سجّل الصفقة",
    date: "التاريخ",
    pair: "الزوج",
    side: "الاتجاه",
    entry: "الدخول",
    stop: "الوقف",
    exit: "الخروج",
    pnl: "الربح/الخسارة",
    noTrades: "لا توجد صفقات مسجلة بعد.",
    open: "مفتوحة",
    remove: "حذف",
  },
  analyzer: {
    title: "محلل الشارت",
    subtitle:
      "ارفع صورة من TradingView أو المنصة لأي زوج. الدقة قبل التنبؤ — قراءة بنيوية لمراجعة تفكيرك الخاص، وليست نصيحة مالية.",
    dragHere: "اسحب صورة الشارت هنا، أو",
    chooseFile: "اختر ملفًا",
    readingChart: "جارٍ قراءة الشارت…",
    analyzeChart: "حلّل الشارت",
    pairLabel: "الزوج",
    timeframeLabel: "الإطار الزمني",
    styleLabel: "أسلوب التداول",
    autoDetect: "اكتشاف تلقائي",
    style: {
      spotSwing: "سبوت سوينغ",
      dayTrade: "تداول يومي",
      scalping: "سكالبينغ",
      learning: "تعلّم",
    },
    marketStructure: "بنية السوق",
    trend: "الاتجاه العام",
    momentum: "الزخم",
    keyLevels: "المستويات الرئيسية",
    currentCondition: "الحالة الحالية",
    noClearSetup: "لا يوجد إعداد واضح",
    bullishScenario: "🟢 السيناريو الصاعد",
    bearishScenario: "🔴 السيناريو الهابط",
    confirmation: "التأكيد",
    targets: "الأهداف المحتملة",
    why: "لماذا",
    whatToWatch: "ما يجب مراقبته",
    invalidation: "نقطة الإبطال",
    invalidationShort: "الإبطال",
    tradePlan: "خطة أطلس للتداول",
    direction: "الاتجاه",
    entryZone: "منطقة الدخول",
    precisionNote:
      "أطلس لا يخترع احتمالات أو أهدافًا مضمونة أو قيم مؤشرات لا يمكنه رؤيتها — فقط قراءات مشروطة قائمة على البنية. وسيقول \"انتظر\" عندما لا يوجد إعداد واضح.",
    genericError: "حدث خطأ ما.",
    connectionError: "تعذر الوصول إلى المحلل. تحقق من اتصالك وحاول مرة أخرى.",
  },
  radar: {
    title: "رادار السوق",
    subtitle:
      "قائمة مختصرة، لا لوحة نقاط — يفحص كل أزواج USDT على Binance بقواعد واضحة ومعلنة. لا تقييم خفي.",
    loading: "جارٍ مسح السوق…",
    error: "تعذر الوصول إلى Binance الآن. ستتم إعادة المحاولة قريبًا.",
    empty: "لا توجد أزواج مطابقة لهذا الفلتر حاليًا.",
    pair: "الزوج",
    price: "السعر",
    change24h: "تغير 24 ساعة",
    vsBtc: "مقابل BTC",
    volume: "حجم 24 ساعة",
    tags: "الوسوم",
    filterAll: "الكل",
    filterVolume: "حجم مرتفع",
    filterBreakout: "اختراق",
    filterPullback: "ارتداد",
    filterNearHigh: "قرب أعلى 24 ساعة",
    filterNearLow: "قرب أدنى 24 ساعة",
    filterOutperform: "يتفوق على BTC",
    tag: {
      breakout: "اختراق",
      pullback: "ارتداد",
      highVolume: "حجم مرتفع",
      nearHigh: "قرب الأعلى",
      nearLow: "قرب الأدنى",
      outperformBtc: "يتفوق على BTC",
      underperformBtc: "أضعف من BTC",
    },
    disclaimer:
      "قواعد واضحة لا سحر: اختراق = ضمن 1% من أعلى 24 ساعة وبتغير إيجابي. ارتداد = صعود 3%+ خلال 24 ساعة لكن بانخفاض 3% على الأقل عن ذلك الأعلى. حجم مرتفع = أعلى 40 زوجًا من حيث حجم التداول خلال 24 ساعة. قرب الأعلى/الأدنى = ضمن 1% من أعلى/أدنى 24 ساعة. مقابل BTC = تغير هذا الزوج خلال 24 ساعة ناقص تغير BTC، بنقاط مئوية. هذا فحص لتضييق بحثك الخاص، وليس إشارة للتداول.",
  },
};

const dictionaries: Record<Lang, Dict> = { en, ar };

function resolve(dict: Dict, path: string): string {
  const parts = path.split(".");
  let node: string | Dict = dict;
  for (const part of parts) {
    if (typeof node === "string") return path;
    node = node[part];
    if (node === undefined) return path;
  }
  return typeof node === "string" ? node : path;
}

type LanguageContextValue = {
  lang: Lang;
  toggleLang: () => void;
  t: (path: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "atlas-trading.lang";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Always start at "en" so the server-rendered HTML and the client's first
  // render match exactly — reading localStorage here would return a
  // different value than the server used, causing a hydration mismatch.
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // Restoring a persisted preference after mount (client-only) avoids the
    // SSR/client mismatch described above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "ar" || stored === "en") setLang(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const toggleLang = () => setLang((l) => (l === "en" ? "ar" : "en"));
  const t = (path: string) => resolve(dictionaries[lang], path);

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
