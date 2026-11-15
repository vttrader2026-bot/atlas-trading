"use client";
// OWNER-STUDIO-LINK: a shortcut to the existing Social Media Studio (/share) on the owner's account page. Display only: it renders
// nothing unless the owner check passes. The real protection is server-side (proxy.ts, app/share/layout.tsx, /api/studio/*).
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { useIsOwner } from "@/lib/useIsOwner";

const COPY = {
  en: { title: "Social Media Studio", note: "Owner tool: create and export promo images.", open: "Open Studio" },
  fr: { title: "Social Media Studio", note: "Outil propriétaire : créez et exportez des visuels promotionnels.", open: "Ouvrir le Studio" },
  ar: { title: "Social Media Studio", note: "أداة المالك: أنشئ وصدّر صور الترويج.", open: "فتح الاستوديو" },
} as const;

export default function OwnerStudioLink() {
  const isOwner = useIsOwner();
  const { lang } = useLanguage();
  if (!isOwner) return null;
  const c = COPY[(lang as keyof typeof COPY) in COPY ? (lang as keyof typeof COPY) : "en"];
  return (
    <section className="rounded-xl border border-white/10 p-5" data-owner-studio-link>
      <h2 className="text-lg font-semibold">{c.title}</h2>
      <p className="text-text-muted text-sm mt-1 max-w-xl">{c.note}</p>
      <Link href="/share" className="mt-3 inline-block px-4 py-2 rounded-md border border-line text-sm hover:border-text-muted transition-colors">
        {c.open}
      </Link>
    </section>
  );
}
