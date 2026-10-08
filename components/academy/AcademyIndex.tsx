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
};

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
    </main>
  );
}
