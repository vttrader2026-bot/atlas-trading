"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { CATEGORY_LABELS, isNewVideo, pick, usedCategories, videoPagePath, type Video, type VideoCategory } from "@/lib/videos";
import { CHROME, formatVideoDate } from "@/components/videos/chrome";
import VideoCard from "@/components/videos/VideoCard";
import VideoThumb, { NewBadge, PlayBadge } from "@/components/videos/VideoThumb";

// VIDEOS-v1: the library page body: header, category filter, a featured newest video, then a responsive grid.
export default function VideoLibrary({ videos }: { videos: Video[] }) {
  const { lang } = useLanguage();
  const [cat, setCat] = useState<VideoCategory | "all">("all");
  const cats = usedCategories(videos);
  const shown = cat === "all" ? videos : videos.filter((v) => v.category === cat);
  // NEW-VIDEOS-v1: recently published videos lead the library (newest first); without any, the first video is featured as before.
  const fresh = cat === "all" ? videos.filter((v) => isNewVideo(v)).sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)) : [];
  const featured = cat === "all" ? (fresh[0] ?? shown[0]) : undefined;
  const moreFresh = fresh.filter((v) => v !== featured);
  const rest = shown.filter((v) => v !== featured && !moreFresh.includes(v));
  const leadIsNew = !!featured && isNewVideo(featured);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{CHROME.title[lang]}</h1>
      <p className="mt-1 max-w-xl text-sm text-text-muted">{CHROME.subtitle[lang]}</p>

      {videos.length === 0 ? (
        <div className="card card-accent mt-8 p-6 sm:p-8">
          <h2 className="text-lg font-semibold">{CHROME.empty[lang]}</h2>
          <p className="mt-1 max-w-xl text-sm text-text-muted">{CHROME.emptyBody[lang]}</p>
          <Link href="/academy" className="btn-primary mt-4 inline-flex">{CHROME.toAcademy[lang]}</Link>
        </div>
      ) : (
        <>
          {cats.length > 1 && (
            <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label={CHROME.title[lang]}>
              {(["all", ...cats] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={cat === c}
                  onClick={() => setCat(c)}
                  className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${cat === c ? "border-gold bg-gold/10 text-text" : "border-line text-text-muted hover:border-gold hover:text-text"}`}
                >
                  {c === "all" ? CHROME.all[lang] : CATEGORY_LABELS[c][lang]}
                </button>
              ))}
            </div>
          )}

          {featured && (
            <Link
              href={videoPagePath(featured.id)}
              className="group card card-accent card-hover mt-6 grid overflow-hidden md:grid-cols-[1.4fr_1fr]"
            >
              <div className="relative aspect-video bg-surface-raised">
                <VideoThumb id={featured.id} high />
                <PlayBadge large />
              </div>
              <div className="flex flex-col justify-center p-5 sm:p-7">
                <div className="text-label text-gold">
                  {leadIsNew && <NewBadge label={CHROME.isNew[lang]} floating={false} />}{leadIsNew ? " " : ""}
                  {leadIsNew ? CHROME.newVideo[lang] : CHROME.latest[lang]}
                  {featured.category ? ` · ${CATEGORY_LABELS[featured.category][lang]}` : ""}
                </div>
                <h2 className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">{pick(featured.title, lang)}</h2>
                {pick(featured.description, lang) && <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-text-muted">{pick(featured.description, lang)}</p>}
                {featured.date && <div className="mt-3 text-xs text-text-muted">{formatVideoDate(featured.date, lang)}</div>}
              </div>
            </Link>
          )}

          {moreFresh.length > 0 && (
            <section aria-labelledby="new-videos" data-new-videos-section>
              <h2 id="new-videos" className="text-label mt-8 text-gold">{CHROME.newVideos[lang]}</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {moreFresh.map((v) => <VideoCard key={v.id} video={v} />)}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section aria-labelledby="all-videos">
              {(leadIsNew || moreFresh.length > 0) && <h2 id="all-videos" className="text-label mt-8 text-gold">{CHROME.all[lang]}</h2>}
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((v) => <VideoCard key={v.id} video={v} />)}
              </div>
            </section>
          )}
        </>
      )}
      <p className="mt-10 text-xs text-text-muted">{CHROME.disclaimer[lang]}</p>
    </main>
  );
}
