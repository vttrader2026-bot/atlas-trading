const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'components', 'academy', 'AcademyIndex.tsx');
let src = fs.readFileSync(filePath, 'utf8');

// 1. Dedupe the CHROME keys: the block from "communityTitle:" to the end of
// "whatsappCta: ...," appears twice back-to-back inside the CHROME object.
// Collapse to a single copy.
const chromeBlockRe =
  /(  communityTitle: \{[\s\S]*?whatsappCta: \{ en: "Join WhatsApp Community"[^\n]*\n)(  communityTitle: \{[\s\S]*?whatsappCta: \{ en: "Join WhatsApp Community"[^\n]*\n)/;

if (chromeBlockRe.test(src)) {
  src = src.replace(chromeBlockRe, '$1');
  console.log('Removed duplicate CHROME community keys');
} else {
  console.log('No duplicate CHROME keys found (already clean)');
}

// 2. Dedupe TELEGRAM_URL / WHATSAPP_URL / IconTelegram / IconWhatsapp: this
// whole block appears twice back-to-back before "export default function".
const constsBlockRe =
  /(const TELEGRAM_URL = "https:\/\/t\.me\/atlastradingcrypto";\nconst WHATSAPP_URL = "https:\/\/chat\.whatsapp\.com\/Br0OH7mHCHv6MpTmIas2Je\?mode=gi_t";\n\nfunction IconTelegram[\s\S]*?\n}\n\nfunction IconWhatsapp[\s\S]*?\n}\n\n)(const TELEGRAM_URL = "https:\/\/t\.me\/atlastradingcrypto";\nconst WHATSAPP_URL = "https:\/\/chat\.whatsapp\.com\/Br0OH7mHCHv6MpTmIas2Je\?mode=gi_t";\n\nfunction IconTelegram[\s\S]*?\n}\n\nfunction IconWhatsapp[\s\S]*?\n}\n\n)/;

if (constsBlockRe.test(src)) {
  src = src.replace(constsBlockRe, '$1');
  console.log('Removed duplicate TELEGRAM_URL/WHATSAPP_URL/icon definitions');
} else {
  console.log('No duplicate constants/icons found (already clean)');
}

// 3. Dedupe the <section> ... </section> community CTA block in the JSX:
// it appears twice back-to-back right before the closing </main>.
const sectionBlockRe =
  /(      <section className="mt-14 border-t border-line pt-10">[\s\S]*?<\/section>\n)(      <section className="mt-14 border-t border-line pt-10">[\s\S]*?<\/section>\n)/;

if (sectionBlockRe.test(src)) {
  src = src.replace(sectionBlockRe, '$1');
  console.log('Removed duplicate community CTA <section> in JSX');
} else {
  console.log('No duplicate JSX section found (already clean)');
}

fs.writeFileSync(filePath, src, 'utf8');
console.log('Wrote components/academy/AcademyIndex.tsx');
