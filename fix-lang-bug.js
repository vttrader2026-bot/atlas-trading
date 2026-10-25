const fs = require('fs');
const path = require('path');

// ---------- 1. lib/i18n.tsx ----------
const i18nPath = path.join(__dirname, 'lib', 'i18n.tsx');
let i18n = fs.readFileSync(i18nPath, 'utf8');

const enBlock = `  pulseSection: {
    eyebrow: "MARKET PULSE",
    heading: "The market, at a glance.",
    liveMarkets: "Live Markets",
    live: "LIVE",
    openRadar: "Open Market Radar",
  },
  workspaceSection: {
    eyebrow: "TRADING WORKSPACE",
    heading: "Trade with structure.",
    subtitle: "From analysis to execution, Atlas gives traders the tools to plan, manage, and review every trade.",
    riskTitle: "Risk Calculator",
    accountBalance: "Account balance",
    riskPerTrade: "Risk per trade",
    positionSize: "Position size",
    journalTitle: "Trading Journal",
    journalNote: "Log every trade. Review the real numbers.",
    tradeFeedTitle: "Trade Feed",
    tradeFeedNote: "Entry, targets, and stop-loss for every published setup.",
    openPrefix: "Open",
  },
  communitySection: {
    eyebrow: "THE ATLAS COMMUNITY",
    heading: "Trade smarter together.",
    subtitle: "Market discussions, educational content, trade updates, and Atlas news - free to join.",
    telegram: "Telegram",
    telegramBody: "Live discussion, public calls, and platform updates.",
    telegramCta: "Join Telegram Community",
    whatsapp: "WhatsApp",
    whatsappBody: "Join the community group for updates on the go.",
    whatsappCta: "Join WhatsApp Community",
  },
  eliteSection: {
    eyebrow: "ATLAS ELITE",
    heading: "Trade with Atlas. Stay ahead of the setup.",
    subtitle: "Private spot signals, earlier access, and full trade management for traders who want more than the public feed.",
    f1: "Private Spot Signals",
    f2: "Earlier Signal Access",
    f3: "AI Analyzer - 20 analyses/day",
    f4: "TP1 / TP2 / TP3 Updates",
    f5: "Stop-Loss Updates",
    f6: "Full Trade Management",
    f7: "Private Telegram Group",
    f8: "Atlas Bot Alerts",
    f9: "Elite Market Updates",
    perMonth: "/month",
    cta: "Join Atlas Elite",
  },
`;

const arBlock = `  pulseSection: {
    eyebrow: "نبض السوق",
    heading: "السوق، بلمحة واحدة.",
    liveMarkets: "الأسواق المباشرة",
    live: "مباشر",
    openRadar: "افتح رادار السوق",
  },
  workspaceSection: {
    eyebrow: "مساحة عمل التداول",
    heading: "تداول ببنية واضحة.",
    subtitle: "من التحليل إلى التنفيذ، يمنحك أطلس أدوات لتخطيط كل صفقة وإدارتها ومراجعتها.",
    riskTitle: "حاسبة المخاطر",
    accountBalance: "رصيد الحساب",
    riskPerTrade: "المخاطرة لكل صفقة",
    positionSize: "حجم الصفقة",
    journalTitle: "سجل التداول",
    journalNote: "سجّل كل صفقة. راجع الأرقام الحقيقية.",
    tradeFeedTitle: "خلاصة الصفقات",
    tradeFeedNote: "الدخول والأهداف ووقف الخسارة لكل إعداد منشور.",
    openPrefix: "افتح",
  },
  communitySection: {
    eyebrow: "مجتمع أطلس",
    heading: "تداول بذكاء أكبر معًا.",
    subtitle: "نقاشات السوق، محتوى تعليمي، تحديثات الصفقات، وأخبار أطلس - انضم مجانًا.",
    telegram: "تيليجرام",
    telegramBody: "نقاش مباشر، توصيات عامة، وتحديثات المنصة.",
    telegramCta: "انضم إلى مجتمع تيليجرام",
    whatsapp: "واتساب",
    whatsappBody: "انضم إلى مجموعة المجتمع لتحديثات أثناء التنقل.",
    whatsappCta: "انضم إلى مجتمع واتساب",
  },
  eliteSection: {
    eyebrow: "ATLAS ELITE",
    heading: "تداول مع أطلس. ابقِ متقدمًا على الإعداد.",
    subtitle: "إشارات سبوت خاصة، وصول مبكر، وإدارة كاملة للصفقات للمتداولين الذين يريدون أكثر من الخلاصة العامة.",
    f1: "إشارات سبوت خاصة",
    f2: "وصول مبكر للإشارات",
    f3: "محلل الذكاء الاصطناعي - 20 تحليلًا يوميًا",
    f4: "تحديثات TP1 / TP2 / TP3",
    f5: "تحديثات وقف الخسارة",
    f6: "إدارة كاملة للصفقات",
    f7: "مجموعة تيليجرام خاصة",
    f8: "تنبيهات بوت أطلس",
    f9: "تحديثات سوق Elite",
    perMonth: "/شهريًا",
    cta: "انضم إلى Atlas Elite",
  },
`;

const frBlock = `  pulseSection: {
    eyebrow: "POULS DU MARCHÉ",
    heading: "Le marché, en un coup d'œil.",
    liveMarkets: "Marchés en direct",
    live: "EN DIRECT",
    openRadar: "Ouvrir le Radar du marché",
  },
  workspaceSection: {
    eyebrow: "ESPACE DE TRADING",
    heading: "Tradez avec structure.",
    subtitle: "De l'analyse à l'exécution, Atlas donne aux traders les outils pour planifier, gérer et revoir chaque trade.",
    riskTitle: "Calculateur de risque",
    accountBalance: "Solde du compte",
    riskPerTrade: "Risque par trade",
    positionSize: "Taille de position",
    journalTitle: "Journal de trading",
    journalNote: "Enregistrez chaque trade. Revoyez les vrais chiffres.",
    tradeFeedTitle: "Fil de trades",
    tradeFeedNote: "Entrée, objectifs et stop-loss pour chaque configuration publiée.",
    openPrefix: "Ouvrir",
  },
  communitySection: {
    eyebrow: "LA COMMUNAUTÉ ATLAS",
    heading: "Tradez plus intelligemment, ensemble.",
    subtitle: "Discussions de marché, contenu éducatif, mises à jour de trades et actualités Atlas - gratuit.",
    telegram: "Telegram",
    telegramBody: "Discussion en direct, appels publics et mises à jour de la plateforme.",
    telegramCta: "Rejoindre la communauté Telegram",
    whatsapp: "WhatsApp",
    whatsappBody: "Rejoignez le groupe communautaire pour des mises à jour en déplacement.",
    whatsappCta: "Rejoindre la communauté WhatsApp",
  },
  eliteSection: {
    eyebrow: "ATLAS ELITE",
    heading: "Tradez avec Atlas. Restez en avance sur la configuration.",
    subtitle: "Signaux spot privés, accès anticipé et gestion complète des trades pour les traders qui veulent plus que le fil public.",
    f1: "Signaux Spot Privés",
    f2: "Accès Anticipé aux Signaux",
    f3: "Analyseur IA - 20 analyses/jour",
    f4: "Mises à jour TP1 / TP2 / TP3",
    f5: "Mises à jour Stop-Loss",
    f6: "Gestion Complète des Trades",
    f7: "Groupe Telegram Privé",
    f8: "Alertes Atlas Bot",
    f9: "Mises à Jour Marché Elite",
    perMonth: "/mois",
    cta: "Rejoindre Atlas Elite",
  },
`;

function insertAfterDictStart(src, marker, block) {
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('Marker not found: ' + marker);
  const insertPos = idx + marker.length;
  return src.slice(0, insertPos) + '\n' + block + src.slice(insertPos);
}

i18n = insertAfterDictStart(i18n, 'const en: Dict = {', enBlock);
i18n = insertAfterDictStart(i18n, 'const ar: Dict = {', arBlock);
i18n = insertAfterDictStart(i18n, 'const fr: Dict = {', frBlock);

fs.writeFileSync(i18nPath, i18n, 'utf8');
console.log('Patched lib/i18n.tsx');

// ---------- 2. app/page.tsx ----------
const pagePath = path.join(__dirname, 'app', 'page.tsx');
let page = fs.readFileSync(pagePath, 'utf8');

const singleLineReplacements = [
  ['MARKET PULSE', '{t("pulseSection.eyebrow")}'],
  ['The market, at a glance.', '{t("pulseSection.heading")}'],
  ['Live Markets', '{t("pulseSection.liveMarkets")}'],
  ['LIVE', '{t("pulseSection.live")}'],
  ['Open Market Radar', '{t("pulseSection.openRadar")}'],
  ['TRADING WORKSPACE', '{t("workspaceSection.eyebrow")}'],
  ['Trade with structure.', '{t("workspaceSection.heading")}'],
  ['title="Risk Calculator"', 'title={t("workspaceSection.riskTitle")}'],
  ['label="Account balance"', 'label={t("workspaceSection.accountBalance")}'],
  ['label="Risk per trade" suffix="%"', 'label={t("workspaceSection.riskPerTrade")} suffix="%"'],
  ['Position size', '{t("workspaceSection.positionSize")}'],
  ['title="Trading Journal"', 'title={t("workspaceSection.journalTitle")}'],
  ['Log every trade. Review the real numbers.', '{t("workspaceSection.journalNote")}'],
  ['title="Trade Feed"', 'title={t("workspaceSection.tradeFeedTitle")}'],
  ['Entry, targets, and stop-loss for every published setup.', '{t("workspaceSection.tradeFeedNote")}'],
  ['Open {title}', '{t("workspaceSection.openPrefix")} {title}'],
  ['THE ATLAS COMMUNITY', '{t("communitySection.eyebrow")}'],
  ['Trade smarter together.', '{t("communitySection.heading")}'],
  ['Market discussions, educational content, trade updates, and Atlas news - free to join.', '{t("communitySection.subtitle")}'],
  ['text-base font-medium">Telegram</div>', 'text-base font-medium">{t("communitySection.telegram")}</div>'],
  ['Live discussion, public calls, and platform updates.', '{t("communitySection.telegramBody")}'],
  ['Join Telegram Community', '{t("communitySection.telegramCta")}'],
  ['text-base font-medium">WhatsApp</div>', 'text-base font-medium">{t("communitySection.whatsapp")}</div>'],
  ['Join the community group for updates on the go.', '{t("communitySection.whatsappBody")}'],
  ['Join WhatsApp Community', '{t("communitySection.whatsappCta")}'],
  ['ATLAS ELITE', '{t("eliteSection.eyebrow")}'],
  ['Trade with Atlas. Stay ahead of the setup.', '{t("eliteSection.heading")}'],
  ['<EliteFeature>Private Spot Signals</EliteFeature>', '<EliteFeature>{t("eliteSection.f1")}</EliteFeature>'],
  ['<EliteFeature>Earlier Signal Access</EliteFeature>', '<EliteFeature>{t("eliteSection.f2")}</EliteFeature>'],
  ['<EliteFeature>AI Analyzer - 20 analyses/day</EliteFeature>', '<EliteFeature>{t("eliteSection.f3")}</EliteFeature>'],
  ['<EliteFeature>TP1 / TP2 / TP3 Updates</EliteFeature>', '<EliteFeature>{t("eliteSection.f4")}</EliteFeature>'],
  ['<EliteFeature>Stop-Loss Updates</EliteFeature>', '<EliteFeature>{t("eliteSection.f5")}</EliteFeature>'],
  ['<EliteFeature>Full Trade Management</EliteFeature>', '<EliteFeature>{t("eliteSection.f6")}</EliteFeature>'],
  ['<EliteFeature>Private Telegram Group</EliteFeature>', '<EliteFeature>{t("eliteSection.f7")}</EliteFeature>'],
  ['<EliteFeature>Atlas Bot Alerts</EliteFeature>', '<EliteFeature>{t("eliteSection.f8")}</EliteFeature>'],
  ['<EliteFeature>Elite Market Updates</EliteFeature>', '<EliteFeature>{t("eliteSection.f9")}</EliteFeature>'],
  ['text-sm text-text-muted font-normal">/month</span>', 'text-sm text-text-muted font-normal">{t("eliteSection.perMonth")}</span>'],
  ['Join Atlas Elite', '{t("eliteSection.cta")}'],
];

let missing = [];
for (const [from, to] of singleLineReplacements) {
  if (!page.includes(from)) {
    missing.push(from);
    continue;
  }
  page = page.split(from).join(to);
}

// Multi-line (whitespace-spanning) replacements via regex
const multiLine = [
  [/From analysis to execution, Atlas gives traders the tools to plan, manage, and review every trade\./, '{t("workspaceSection.subtitle")}'],
  [/Private spot signals, earlier access, and full trade management for traders who want more than the\s+public feed\./, '{t("eliteSection.subtitle")}'],
];
for (const [re, to] of multiLine) {
  if (!re.test(page)) {
    missing.push(re.source);
  } else {
    page = page.replace(re, to);
  }
}

fs.writeFileSync(pagePath, page, 'utf8');
console.log('Patched app/page.tsx');
if (missing.length) {
  console.log('WARNING - these anchors were not found and were skipped:');
  missing.forEach((m) => console.log('  - ' + m));
}

// ---------- 3. app/api/analyze/route.ts ----------
const routePath = path.join(__dirname, 'app', 'api', 'analyze', 'route.ts');
let route = fs.readFileSync(routePath, 'utf8');

const oldServiceTail = '    : "Analyzer temporarily unavailable — we\'re experiencing high demand. Please try again in a moment.";\n}';
const newServiceTail = '    : lang === "fr"\n    ? "Analyseur temporairement indisponible — nous connaissons une forte demande. Veuillez réessayer dans un instant."\n    : "Analyzer temporarily unavailable — we\'re experiencing high demand. Please try again in a moment.";\n}';

if (!route.includes(oldServiceTail)) {
  console.log('WARNING - serviceUnavailableMessage anchor not found, skipped.');
} else {
  route = route.split(oldServiceTail).join(newServiceTail);
  console.log('Patched serviceUnavailableMessage (added French branch)');
}

const oldLangTail = '- Do not mix Arabic and English sentences. The final analysis should read naturally in Arabic.`\n      : "Respond with all human-readable text values written in English.";';
const newLangTail = `- Do not mix Arabic and English sentences. The final analysis should read naturally in Arabic.\`
      : lang === "fr"
      ? \`LANGUAGE REQUIREMENT — VERY IMPORTANT:
- The user selected French. Write EVERY human-readable value in the JSON in French (natural, professional French).
- Do NOT write English words or labels in the analysis text. This includes market structure, trend, strength, conditions, scenario explanations, confirmations, targets descriptions, what-to-watch items, invalidation explanations, trade plan text, risk notes, and Teach Me explanations.
- Technical abbreviations and symbols may remain standard when appropriate: BTC, ETH, USDT, RSI, MACD, MA, BOS, CHoCH, FVG, 15M, 1H, 4H, 1D, 1W.
- Price numbers, ticker symbols, and pair names must remain unchanged.
- Do not mix French and English sentences. The final analysis should read naturally in French.\`
      : "Respond with all human-readable text values written in English.";`;

if (!route.includes(oldLangTail)) {
  console.log('WARNING - languageLine anchor not found, skipped.');
} else {
  route = route.split(oldLangTail).join(newLangTail);
  console.log('Patched buildPrompt languageLine (added French branch)');
}

fs.writeFileSync(routePath, route, 'utf8');
console.log('Patched app/api/analyze/route.ts');
