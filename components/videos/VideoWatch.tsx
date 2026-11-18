"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { CATEGORY_LABELS, pick, videoPagePath, youtubeWatchUrl, type Video } from "@/lib/videos";
import { CHROME, formatVideoDate } from "@/components/videos/chrome";
import VideoPlayer from "@/components/videos/VideoPlayer";
import VideoCard from "@/components/videos/VideoCard";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// VIDEOS-v1: dedicated video view: player, title, description, Watch on YouTube, Share (native sheet or copy link), related videos.
export default function VideoWatch({ video, related }: { video: Video; related: Video[] }) {
  const { lang } = useLanguage();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const title = pick(video.title, lang);
  const backArrow = lang === "ar" ? "→" : "←";

  async function onShare() {
    const url = `${window.location.origin}${videoPagePath(video.id)}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return; // visitor closed the share sheet
      }
    }
    if (await copyText(url)) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/videos" className="text-sm text-text-muted transition-colors hover:text-text">
        {backArrow} {CHROME.back[lang]}
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <article className="min-w-0">
          <VideoPlayer id={video.id} title={title} />
          {video.category && <div className="text-label mt-5 text-gold">{CATEGORY_LABELS[video.category][lang]}</div>}
          <h1 className="mt-1 text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">{title}</h1>
          {video.date && <div className="mt-1 text-sm text-text-muted">{formatVideoDate(video.date, lang)}</div>}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={youtubeWatchUrl(video.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-1.5"
            >
              {CHROME.watchOnYoutube[lang]}
              <span aria-hidden>{lang === "ar" ? "↖" : "↗"}</span>
            </a>
            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-4 py-2 text-sm text-text-muted transition-colors hover:border-gold hover:text-text"
            >
              {copied ? `✓ ${CHROME.linkCopied[lang]}` : CHROME.share[lang]}
            </button>
            <span role="status" aria-live="polite" className="sr-only">{copied ? CHROME.linkCopied[lang] : ""}</span>
          </div>

          {pick(video.description, lang) && <p className="mt-5 max-w-2xl whitespace-pre-line text-base leading-relaxed text-text-muted">{pick(video.description, lang)}</p>}
          <p className="mt-6 text-xs text-text-muted">{CHROME.disclaimer[lang]}</p>
        </article>

        {related.length > 0 && (
          <aside aria-labelledby="related-videos">
            <h2 id="related-videos" className="text-label mb-3 text-gold">{CHROME.related[lang]}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {related.map((v) => <VideoCard key={v.id} video={v} compact />)}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
