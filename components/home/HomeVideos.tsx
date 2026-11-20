"use client";

// HOME-VIDEOS-v1: "Watch Atlas Videos" homepage section. Shows the 3 latest published videos from the existing video library as
// ordinary VideoCards (thumbnail, play badge, NEW label, category) that open /videos/<id>. No YouTube player is loaded here.
// If there are no published videos (or the request fails) the whole section is hidden rather than showing an empty promo.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import type { Video } from "@/lib/videos";
import { CHROME } from "@/components/videos/chrome";
import VideoCard from "@/components/videos/VideoCard";
import HomeSection from "@/components/home/HomeSection";

export function HomeVideosView({ videos }: { videos: Video[] | null }) {
  const { lang } = useLanguage();
  return (
    <HomeSection eyebrow={CHROME.homeEyebrow[lang]} heading={CHROME.homeTitle[lang]} subtitle={CHROME.homeBody[lang]} id="home-videos">
      {videos === null ? (
        <div aria-hidden className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-home-videos-loading>
          {[0, 1, 2].map((i) => (
            <div key={i} className="card overflow-hidden">
              <div className="aspect-video animate-pulse bg-surface-raised" />
              <div className="space-y-2 p-4"><div className="h-3 w-1/3 rounded bg-surface-raised" /><div className="h-4 w-4/5 rounded bg-surface-raised" /></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-home-videos>
          {videos.map((v) => <VideoCard key={v.id} video={v} />)}
        </div>
      )}
      <Link href="/videos" className="btn-primary mt-8 inline-flex items-center gap-2">
        {CHROME.homeCta[lang]} <span aria-hidden className="rtl:rotate-180">{"→"}</span>
      </Link>
    </HomeSection>
  );
}

export default function HomeVideos() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/home-videos")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((d: { videos?: Video[] }) => { if (!off) setVideos(Array.isArray(d.videos) ? d.videos : []); })
      .catch(() => { if (!off) setVideos([]); });
    return () => { off = true; };
  }, []);
  if (videos !== null && videos.length === 0) return null;
  return <HomeVideosView videos={videos} />;
}
