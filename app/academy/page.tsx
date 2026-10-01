import Link from "next/link";
import { SECTION_ORDER, SECTION_LABELS, lessonsBySection } from "@/lib/academy-content";

export const metadata = {
  title: "تعلّم — Atlas Trading Academy",
  description: "دروس قصيرة لتعلم أساسيات تداول العملات الرقمية، التحليل الفني، وإدارة المخاطر.",
};

export default function AcademyPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">تعلّم</h1>
      <p className="text-text-muted text-sm mt-1 max-w-xl">
        دروس قصيرة ومباشرة لفهم أساسيات التداول وإدارة المخاطر — كل درس ينتهي برابط لتجربة المفهوم في أداة حقيقية على الموقع.
      </p>

      <div className="mt-8 space-y-10">
        {SECTION_ORDER.map((section) => {
          const sectionLessons = lessonsBySection(section);
          return (
            <section key={section}>
              <h2 className="text-label text-gold mb-3">{SECTION_LABELS[section]}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {sectionLessons.map((lesson) => (
                  <Link
                    key={lesson.slug}
                    href={`/academy/${lesson.slug}`}
                    className="rounded-2xl border border-line bg-surface p-5 card-hover"
                  >
                    <div className="font-medium">{lesson.title}</div>
                    <p className="text-sm text-text-muted mt-1.5 leading-relaxed">{lesson.summary}</p>
                    {!lesson.ready && (
                      <span className="inline-block mt-2 text-[11px] text-text-muted border border-line rounded-full px-2 py-0.5">
                        قريبًا
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
