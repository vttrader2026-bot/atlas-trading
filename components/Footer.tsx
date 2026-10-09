"use client";

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
