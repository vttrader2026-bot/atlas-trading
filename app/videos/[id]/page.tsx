import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VideoWatch from "@/components/videos/VideoWatch";
import { SITE_URL, getVideo, getVideos, relatedVideos, thumbHigh, videoPagePath, youtubeEmbedUrl } from "@/lib/videos";

// VIDEOS-v1: one page per video, pre-rendered from lib/videos.ts. Metadata is English (language isn't known server-side).
export function generateStaticParams() {
  return getVideos().map((v) => ({ id: v.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const v = getVideo(id);
  if (!v) return { title: "Video — Atlas Trading" };
  const title = `${v.title.en} — Atlas Trading`;
  return {
    title,
    description: v.description.en,
    alternates: { canonical: `${SITE_URL}${videoPagePath(v.id)}` },
    openGraph: { title, description: v.description.en, type: "video.other", url: `${SITE_URL}${videoPagePath(v.id)}`, images: [thumbHigh(v.id)] },
    twitter: { card: "summary_large_image", title, description: v.description.en, images: [thumbHigh(v.id)] },
  };
}

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = getVideos();
  const video = getVideo(id, list);
  if (!video) notFound();

  // Structured data so search engines can show the video. "<" is escaped so the JSON can never close the script tag.
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title.en,
    description: video.description.en,
    thumbnailUrl: [thumbHigh(video.id)],
    embedUrl: youtubeEmbedUrl(video.id),
    ...(video.date ? { uploadDate: video.date } : {}),
  }).replace(/</g, "\\u003c");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <VideoWatch video={video} related={relatedVideos(video, list)} />
    </>
  );
}
