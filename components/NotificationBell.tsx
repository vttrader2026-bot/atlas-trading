"use client";

// Header bell. With nothing new it is a way into the existing Notification Settings (the section on /account). When videos were
// published since the member last opened the video library it shows a count and links straight to the video (one new) or /videos.
// The count comes from /api/me/new-videos; visiting any /videos page marks the new videos as seen. No push notification is involved.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import { CHROME } from "@/components/videos/chrome";

const SETTINGS_HREF = "/account#notifications";

export default function NotificationBell() {
  const pathname = usePathname() ?? "";
  const [fresh, setFresh] = useState<{ count: number; latestId: string | null }>({ count: 0, latestId: null });
  const inVideos = pathname === "/videos" || pathname.startsWith("/videos/");

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        if (inVideos) {
          await fetch("/api/me/new-videos", { method: "POST" });
          if (!off) setFresh({ count: 0, latestId: null });
          return;
        }
        const res = await fetch("/api/me/new-videos", { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { count?: unknown; latestId?: unknown };
        if (!off) setFresh({ count: Number(d.count) > 0 ? Number(d.count) : 0, latestId: typeof d.latestId === "string" ? d.latestId : null });
      } catch {
        /* the bell simply shows no indicator */
      }
    })();
    return () => { off = true; };
  }, [inVideos, pathname]);

  return <NotificationBellView count={fresh.count} latestId={fresh.latestId} />;
}

/** The bell itself (separate from the fetching so it can be rendered and tested on its own). */
export function NotificationBellView({ count: n, latestId }: { count: number; latestId: string | null }) {
  const { t, lang } = useLanguage();
  const href = n > 0 ? (n === 1 && latestId ? `/videos/${latestId}` : "/videos") : SETTINGS_HREF;
  const label = n > 0 ? (n === 1 ? CHROME.bellOne[lang] : CHROME.bellMany[lang].replace("{n}", String(n))) : t("nav.notifications");
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      data-notification-bell
      data-new-videos={n > 0 ? n : undefined}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-gold/15 text-gold transition-colors hover:border-gold hover:bg-gold/25 focus-visible:outline-2 focus-visible:outline-gold"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </svg>
      {n > 0 && (
        <span aria-hidden="true" className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg bg-bear px-1 text-[11px] font-bold leading-none text-white">
          {n > 9 ? "9+" : n}
        </span>
      )}
    </Link>
  );
}
