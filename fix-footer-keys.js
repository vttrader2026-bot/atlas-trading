const fs = require('fs');
const path = require('path');

const i18nPath = path.join(__dirname, 'lib', 'i18n.tsx');
let i18n = fs.readFileSync(i18nPath, 'utf8');

const enAdditions = `    tagline: "See the market clearly. Trade with a plan.",
    description: "AI chart analysis, market discovery, trade planning, risk management, and journaling - one workspace for crypto traders.",
    exploreHeading: "EXPLORE",
    communityHeading: "COMMUNITY",
    eliteHeading: "ATLAS ELITE",
    eliteTagline: "Private spot signals, earlier access, trade management, and real-time TP/SL updates.",
    eliteCta: "Join Atlas Elite",
    joinTelegram: "Join Telegram",
    joinWhatsapp: "Join WhatsApp",
    copyright: "© 2026 Atlas Trading. All rights reserved.",
`;

const arAdditions = `    tagline: "اقرأ السوق بوضوح. تداول بخطة.",
    description: "تحليل شارت بالذكاء الاصطناعي، اكتشاف السوق، تخطيط الصفقات، إدارة المخاطر، والسجل - مساحة عمل واحدة لمتداولي الكريبتو.",
    exploreHeading: "استكشف",
    communityHeading: "المجتمع",
    eliteHeading: "ATLAS ELITE",
    eliteTagline: "إشارات سبوت خاصة، وصول مبكر، إدارة صفقات، وتحديثات TP/SL فورية.",
    eliteCta: "انضم إلى Atlas Elite",
    joinTelegram: "انضم إلى تيليجرام",
    joinWhatsapp: "انضم إلى واتساب",
    copyright: "© 2026 Atlas Trading. جميع الحقوق محفوظة.",
`;

const frAdditions = `    tagline: "Lisez le marché clairement. Tradez avec un plan.",
    description: "Analyse de graphiques par IA, découverte de marché, planification de trades, gestion du risque et journal - un seul espace de travail pour les traders crypto.",
    exploreHeading: "EXPLORER",
    communityHeading: "COMMUNAUTÉ",
    eliteHeading: "ATLAS ELITE",
    eliteTagline: "Signaux spot privés, accès anticipé, gestion des trades, et mises à jour TP/SL en temps réel.",
    eliteCta: "Rejoindre Atlas Elite",
    joinTelegram: "Rejoindre Telegram",
    joinWhatsapp: "Rejoindre WhatsApp",
    copyright: "© 2026 Atlas Trading. Tous droits réservés.",
`;

// Step 1: remove the misplaced copies (landed inside home.community)
let removedCount = 0;
for (const block of [enAdditions, arAdditions, frAdditions]) {
  if (i18n.includes(block)) {
    i18n = i18n.replace(block, '');
    removedCount++;
  }
}
console.log(`Removed ${removedCount} misplaced block(s) from home.community`);

// Step 2: insert correctly inside each dict's actual top-level footer object
function insertIntoFooter(src, dictMarker, block) {
  const idxDict = src.indexOf(dictMarker);
  if (idxDict === -1) throw new Error('dict marker not found: ' + dictMarker);
  const idxFooter = src.indexOf('  footer: {', idxDict);
  if (idxFooter === -1) throw new Error('footer block not found for ' + dictMarker);
  const idxJoinFree = src.indexOf('    joinFree:', idxFooter);
  if (idxJoinFree === -1) throw new Error('footer.joinFree not found for ' + dictMarker);
  return src.slice(0, idxJoinFree) + block + src.slice(idxJoinFree);
}

i18n = insertIntoFooter(i18n, 'const en: Dict = {', enAdditions);
i18n = insertIntoFooter(i18n, 'const ar: Dict = {', arAdditions);
i18n = insertIntoFooter(i18n, 'const fr: Dict = {', frAdditions);

fs.writeFileSync(i18nPath, i18n, 'utf8');
console.log('Inserted footer.* keys correctly into the footer object for en/ar/fr');
