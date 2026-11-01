"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { SECTION_LABELS, type Lesson } from "@/lib/academy-content";
import LessonDiagram from "@/components/academy/LessonDiagram";
import ToolCTA from "@/components/academy/ToolCTA";

export default function LessonView({ lesson }: { lesson: Lesson }) {
  const { lang, t } = useLanguage();
  const paragraphs = lesson.body[lang].split("\n\n").filter(Boolean);
  // "Back" points the way the reading direction flows: right in Arabic (RTL), left otherwise.
  const backArrow = lang === "ar" ? "→" : "←";

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <Link href="/academy" className="text-sm text-text-muted hover:text-text transition-colors">
        {backArrow} {t("nav.academy")}
      </Link>

      <div className="text-label text-gold mt-4">{SECTION_LABELS[lesson.section][lang]}</div>
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1">{lesson.title[lang]}</h1>

      {lesson.hasDiagram !== false && (
        <div className="mt-6">
          <LessonDiagram diagramId={lesson.diagramId} />
        </div>
      )}

      <div className="mt-6 space-y-4 text-base leading-relaxed">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {lesson.linkedTool && (
        <ToolCTA href={lesson.linkedTool.href} ctaText={lesson.linkedTool.ctaText[lang]} />
      )}
    </main>
  );
}
