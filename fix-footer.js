const fs = require('fs');
const path = require('path');

// ---------- 1. lib/i18n.tsx - add footer keys ----------
const i18nPath = path.join(__dirname, 'lib', 'i18n.tsx');
let i18n = fs.readFileSync(i18nPath, 'utf8');

function patchFooter(src, marker, additions) {
  // Find the "footer: {" block that belongs to this dict (the one right
  // after `disclaimer: "...",` inside it) and insert new keys before its
  // closing "},". We anchor on the unique joinFree/contactVip pair that
  // already exists in every dict's footer block.
  const anchor = `    joinFree:`;
  const idxMarker = src.indexOf(marker);
  if (idxMarker === -1) throw new Error('dict marker not found: ' + marker);
  const idxAnchor = src.indexOf(anchor, idxMarker);
  if (idxAnchor === -1) throw new Error('footer.joinFree not found after ' + marker);
  // Insert the new keys right before "joinFree:" so we don't need to find
  // the closing brace (whose indentation we can't be 100% sure of).
  return src.slice(0, idxAnchor) + additions + src.slice(idxAnchor);
}

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

i18n = patchFooter(i18n, 'const en: Dict = {', enAdditions);
i18n = patchFooter(i18n, 'const ar: Dict = {', arAdditions);
i18n = patchFooter(i18n, 'const fr: Dict = {', frAdditions);

fs.writeFileSync(i18nPath, i18n, 'utf8');
console.log('Patched lib/i18n.tsx with footer.* keys');

// ---------- 2. components/Footer.tsx - full rewrite ----------
const footerPath = path.join(__dirname, 'components', 'Footer.tsx');

const newFooter = `"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { useLanguage } from "@/lib/i18n";

const TELEGRAM_URL = "https://t.me/atlastradingcrypto";
const WHATSAPP_URL = "https://chat.whatsapp.com/Br0OH7mHCHv6MpTmIas2Je?mode=gi_t";

export default function Footer() {
  const { t } = useLanguage();

  const exploreLinks = [
    { href: "/radar", label: t("nav.radar") },
    { href: "/analyzer", label: t("nav.analyzer") },
    { href: "/trade-feed", label: t("nav.tradeFeed") },
    { href: "/trade-plan", label: t("nav.tradePlan") },
    { href: "/risk", label: t("nav.risk") },
    { href: "/journal", label: t("nav.journal") },
    { href: "/academy", label: t("nav.academy") },
  ];

  return (
    <footer className="border-t border-line mt-16">
      <div className="max-w-6xl mx-auto px-6 py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.8fr_0.8fr_1fr]">
        {/* BRAND */}
        <div>
          <Logo />
          <p className="mt-3 text-sm font-medium text-text max-w-xs">{t("footer.tagline")}</p>
          <p className="mt-2 text-xs text-text-muted max-w-xs leading-relaxed">
            {t("footer.description")}
          </p>
        </div>

        {/* EXPLORE */}
        <div>
          <div className="text-label text-text-muted">{t("footer.exploreHeading")}</div>
          <ul className="mt-3 space-y-2">
            {exploreLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-text-muted hover:text-gold transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* COMMUNITY */}
        <div>
          <div className="text-label text-text-muted">{t("footer.communityHeading")}</div>
          <ul className="mt-3 space-y-2">
            <li>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-text-muted hover:text-gold transition-colors"
              >
                {t("footer.joinTelegram")}
              </a>
            </li>
            <li>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-text-muted hover:text-gold transition-colors"
              >
                {t("footer.joinWhatsapp")}
              </a>
            </li>
          </ul>
        </div>

        {/* ATLAS ELITE - stronger visual emphasis */}
        <div className="rounded-xl border border-gold/30 bg-gold/5 p-5">
          <div className="text-label text-gold">{t("footer.eliteHeading")}</div>
          <p className="mt-2 text-xs text-text-muted leading-relaxed">{t("footer.eliteTagline")}</p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              $14.99<span className="text-xs text-text-muted font-normal">/mo</span>
            </span>
            <Link
              href="/elite"
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-gold text-black hover:opacity-90 transition-opacity"
            >
              {t("footer.eliteCta")}
            </Link>
          </div>
        </div>
      </div>

      {/* LEGAL */}
      <div className="border-t border-line">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-text-muted leading-relaxed max-w-2xl">{t("footer.disclaimer")}</p>
          <p className="text-xs text-text-muted whitespace-nowrap">{t("footer.copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
`;

fs.writeFileSync(footerPath, newFooter, 'utf8');
console.log('Rewrote components/Footer.tsx');
