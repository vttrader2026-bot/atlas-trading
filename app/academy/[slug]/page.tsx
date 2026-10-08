import { notFound } from "next/navigation";
import { getLesson } from "@/lib/academy-content";
import LessonView from "@/components/academy/LessonView";

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson) notFound();

  return <LessonView lesson={lesson} />;
}
