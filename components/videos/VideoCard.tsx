"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { CATEGORY_LABELS, pick, videoPagePath, type Video } from "@/lib/videos";
import { formatVideoDate } from "@/components/videos/chrome";
import VideoThumb, { PlayBadge } from "@/components/videos/VideoThumb";

// VIDEOS-v1: one library card (thumbnail, category, title, short description, date). Only a thumbnail is loaded: no player.
export default function VideoCard({ video, compact = false }: { video: Video; compact?: boolean }) {
  const { lang } = useLanguage();
  const title = pick(video.title, lang);
  return (
    <Link
      href={videoPagePath(video.id)}
      className={`group rounded-2xl border border-line bg-surface card-hover overflow-hidden ${compact ? "flex gap-3 p-2.5" : "block"}`}
    >
      <div className={`relative aspect-video overflow-hidden bg-surface-raised ${compact ? "w-36 shrink-0 rounded-lg sm:w-40" : ""}`}>
        <VideoThumb id={video.id} />
        <PlayBadge />
      </div>
      <div className={compact ? "min-w-0 py-0.5" : "p-4"}>
        {video.category && <div className="text-label text-gold">{CATEGORY_LABELS[video.category][lang]}</div>}
        <h3 className={`font-medium leading-snug ${compact ? "mt-0.5 line-clamp-3 text-sm" : "mt-1 line-clamp-2"}`}>{title}</h3>
        {!compact && pick(video.description, lang) && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-text-muted">{pick(video.description, lang)}</p>}
        {video.date && <div className="mt-2 text-xs text-text-muted">{formatVideoDate(video.date, lang)}</div>}
      </div>
    </Link>
  );
}
