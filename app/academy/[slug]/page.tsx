import Link from "next/link";
import { notFound } from "next/navigation";
import { getLesson, SECTION_LABELS } from "@/lib/academy-content";
import LessonDiagram from "@/components/academy/LessonDiagram";
import ToolCTA from "@/components/academy/ToolCTA";

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson) notFound();

  const paragraphs = lesson.body.split("\n\n").filter(Boolean);

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <Link href="/academy" className="text-sm text-text-muted hover:text-text transition-colors">
        ← تعلّم
      </Link>

      <div className="text-label text-gold mt-4">{SECTION_LABELS[lesson.section]}</div>
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1">{lesson.title}</h1>

      <div className="mt-6">
        <LessonDiagram diagramId={lesson.diagramId} />
      </div>

      <div className="mt-6 space-y-4 text-base leading-relaxed">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <ToolCTA href={lesson.linkedTool.href} ctaText={lesson.linkedTool.ctaText} />
    </main>
  );
}
