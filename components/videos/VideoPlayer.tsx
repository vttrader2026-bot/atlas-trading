"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { youtubeEmbedUrl } from "@/lib/videos";
import { CHROME } from "@/components/videos/chrome";
import VideoThumb, { PlayBadge } from "@/components/videos/VideoThumb";

// VIDEOS-v1: click-to-load player. Until the visitor presses play only the thumbnail is shown (no YouTube scripts,
// no cookies, no iframe); then the privacy-friendly youtube-nocookie player loads and starts. Always a 16:9 box.
export default function VideoPlayer({ id, title }: { id: string; title: string }) {
  const { lang } = useLanguage();
  const [playing, setPlaying] = useState(false);
  return (
    <div className="group relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-black">
      {playing ? (
        <iframe
          src={youtubeEmbedUrl(id, true)}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={CHROME.playNamed[lang].replace("{title}", title)}
          className="absolute inset-0 h-full w-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-gold"
        >
          <VideoThumb id={id} high />
          <span aria-hidden className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
          <PlayBadge large />
        </button>
      )}
    </div>
  );
}
