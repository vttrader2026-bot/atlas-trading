"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { SECTION_ORDER, SECTION_LABELS, lessonsBySection } from "@/lib/academy-content";

// Page-level chrome strings live here (not in lib/i18n.tsx) so the Academy
// stays self-contained and doesn't add more edits to that shared, frequently
// touched file.
const CHROME = {
  title: { en: "Academy", ar: "تعلّم", fr: "Académie" },
  subtitle: {
    en: "Short, practical lessons on trading basics and risk management — each one ends with a link to try the concept in a real tool on the site.",
    ar: "دروس قصيرة ومباشرة لفهم أساسيات التداول وإدارة المخاطر — كل درس ينتهي برابط لتجربة المفهوم في أداة حقيقية على الموقع.",
    fr: "Des leçons courtes et pratiques sur les bases du trading et la gestion du risque — chacune se termine par un lien pour essayer le concept dans un vrai outil du site.",
  },
  soon: { en: "Coming soon", ar: "قريبًا", fr: "Bientôt" },
  communityTitle: {
    en: "Learn with the community",
    ar: "\u062A\u0639\u0644\u0651\u0645 \u0645\u0639 \u0627\u0644\u0645\u062C\u062A\u0645\u0639",
    fr: "Apprenez avec la communaut\u00E9",
  },
  communityBody: {
    en: "Free Telegram and WhatsApp groups for market discussion, questions, and a weekly live education session on WhatsApp.",
    ar: "\u0645\u062C\u0645\u0648\u0639\u0627\u062A \u0645\u062C\u0627\u0646\u064A\u0629 \u0639\u0644\u0649 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645 \u0648\u0648\u0627\u062A\u0633\u0627\u0628 \u0644\u0646\u0642\u0627\u0634 \u0627\u0644\u0633\u0648\u0642 \u0648\u0627\u0644\u0623\u0633\u0626\u0644\u0629\u060C \u0628\u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u062C\u0644\u0633\u0629 \u062A\u0639\u0644\u064A\u0645\u064A\u0629 \u0645\u0628\u0627\u0634\u0631\u0629 \u0623\u0633\u0628\u0648\u0639\u064A\u0629 \u0639\u0644\u0649 \u0648\u0627\u062A\u0633\u0627\u0628.",
    fr: "Groupes Telegram et WhatsApp gratuits pour discuter du march\u00E9, poser des questions, et une session \u00E9ducative hebdomadaire en direct sur WhatsApp.",
  },
  telegramTitle: { en: "Telegram", ar: "\u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645", fr: "Telegram" },
  telegramBody: {
    en: "Live discussion, public calls, and platform updates.",
    ar: "\u0646\u0642\u0627\u0634 \u0645\u0628\u0627\u0634\u0631\u060C \u062A\u0648\u0635\u064A\u0627\u062A \u0639\u0627\u0645\u0629\u060C \u0648\u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0627\u0644\u0645\u0646\u0635\u0629.",
    fr: "Discussion en direct, appels publics et mises \u00E0 jour de la plateforme.",
  },
  telegramCta: { en: "Join Telegram Community", ar: "\u0627\u0646\u0636\u0645 \u0625\u0644\u0649 \u0645\u062C\u062A\u0645\u0639 \u062A\u064A\u0644\u064A\u062C\u0631\u0627\u0645", fr: "Rejoindre la communaut\u00E9 Telegram" },
  whatsappTitle: { en: "WhatsApp", ar: "\u0648\u0627\u062A\u0633\u0627\u0628", fr: "WhatsApp" },
  whatsappBody: {
    en: "Weekly live trading education session plus community updates.",
    ar: "\u062C\u0644\u0633\u0629 \u062A\u0639\u0644\u064A\u0645\u064A\u0629 \u0645\u0628\u0627\u0634\u0631\u0629 \u0623\u0633\u0628\u0648\u0639\u064A\u0629 \u0628\u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0627\u0644\u0645\u062C\u062A\u0645\u0639.",
    fr: "Session \u00E9ducative hebdomadaire en direct, plus les mises \u00E0 jour de la communaut\u00E9.",
  },
  whatsappCta: { en: "Join WhatsApp Community", ar: "\u0627\u0646\u0636\u0645 \u0625\u0644\u0649 \u0645\u062C\u062A\u0645\u0639 \u0648\u0627\u062A\u0633\u0627\u0628", fr: "Rejoindre la communaut\u00E9 WhatsApp" },
};

const TELEGRAM_URL = "https://t.me/atlastradingcrypto";
const WHATSAPP_URL = "https://chat.whatsapp.com/Br0OH7mHCHv6MpTmIas2Je?mode=gi_t";

function IconTelegram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="24" fill="#26A5E4" />
      <path
        fill="#fff"
        d="M35.5 14.3 10.9 23.8c-1.7.7-1.7 1.6-.3 2l6.3 2 2.4 7.4c.3.8.5 1.1 1 1.1.5 0 .8-.2 1.1-.5l3.1-3 6.4 4.7c1.2.7 2 .3 2.3-1.1l4.2-19.8c.4-1.8-.6-2.6-2-2.3zM18.9 25.5l12.7-8c.6-.4 1.2-.2.7.2L21.6 27.1l-.4 4.1-1.9-5.4z"
      />
    </svg>
  );
}

function IconWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="24" fill="#25D366" />
      <path
        fill="#fff"
        d="M24 10.5c-7.5 0-13.5 6-13.5 13.5 0 2.4.6 4.6 1.8 6.6L10 37.5l7.1-2.3c1.9 1 4.1 1.6 6.4 1.6h.1c7.5 0 13.5-6 13.5-13.5S31.5 10.5 24 10.5zm7.9 19.1c-.3.9-1.7 1.7-2.4 1.8-.6.1-1.4.1-2.3-.1-.5-.2-1.2-.4-2-.7-3.6-1.6-6-5.2-6.2-5.5-.2-.3-1.5-1.9-1.5-3.7 0-1.8.9-2.6 1.3-3 .3-.3.7-.5 1-.5h.7c.2 0 .5 0 .8.6.3.7 1 2.5 1.1 2.7.1.2.2.4 0 .7-.1.3-.2.4-.4.6-.2.2-.4.5-.6.7-.2.2-.4.5-.2.8.2.4 1 1.6 2.1 2.6 1.4 1.3 2.6 1.7 3 1.9.4.2.6.1.8-.1.2-.3.9-1 1.2-1.4.3-.4.5-.3.8-.2.3.1 2.1 1 2.5 1.2.4.2.6.3.7.5.1.2.1 1-.2 1.9z"
      />
    </svg>
  );
}

export default function AcademyIndex() {
  const { lang } = useLanguage();

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{CHROME.title[lang]}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-xl">{CHROME.subtitle[lang]}</p>

      <div className="mt-8 space-y-10">
        {SECTION_ORDER.map((section) => {
          const sectionLessons = lessonsBySection(section);
          return (
            <section key={section}>
              <h2 className="text-label text-gold mb-3">{SECTION_LABELS[section][lang]}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {sectionLessons.map((lesson) => (
                  <Link
                    key={lesson.slug}
                    href={`/academy/${lesson.slug}`}
                    className="rounded-2xl border border-line bg-surface p-5 card-hover"
                  >
                    <div className="font-medium">{lesson.title[lang]}</div>
                    <p className="text-sm text-text-muted mt-1.5 leading-relaxed">{lesson.summary[lang]}</p>
                    {!lesson.ready && (
                      <span className="inline-block mt-2 text-[11px] text-text-muted border border-line rounded-full px-2 py-0.5">
                        {CHROME.soon[lang]}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <section className="mt-14 border-t border-line pt-10">
        <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">{CHROME.communityTitle[lang]}</h2>
        <p className="mt-2 text-sm text-text-muted max-w-xl leading-relaxed">{CHROME.communityBody[lang]}</p>

        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          <div className="group border border-line rounded-xl bg-surface p-6 hover:border-[#26A5E4]/50 transition-colors duration-300">
            <IconTelegram className="w-11 h-11" />
            <div className="mt-4 text-base font-medium">{CHROME.telegramTitle[lang]}</div>
            <p className="mt-1.5 text-sm text-text-muted leading-relaxed">{CHROME.telegramBody[lang]}</p>
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-5 inline-flex items-center gap-1.5"
            >
              {CHROME.telegramCta[lang]}
              <span aria-hidden>{"\u2192"}</span>
            </a>
          </div>

          <div className="group border border-line rounded-xl bg-surface p-6 hover:border-[#25D366]/50 transition-colors duration-300">
            <IconWhatsapp className="w-11 h-11" />
            <div className="mt-4 text-base font-medium">{CHROME.whatsappTitle[lang]}</div>
            <p className="mt-1.5 text-sm text-text-muted leading-relaxed">{CHROME.whatsappBody[lang]}</p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-5 inline-flex items-center gap-1.5"
            >
              {CHROME.whatsappCta[lang]}
              <span aria-hidden>{"\u2192"}</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
