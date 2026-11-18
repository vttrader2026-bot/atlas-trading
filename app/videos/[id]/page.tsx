import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VideoWatch from "@/components/videos/VideoWatch";
import { SITE_URL, getVideo, relatedVideos, thumbHigh, videoPagePath, youtubeEmbedUrl } from "@/lib/videos";
import { loadPublished } from "@/lib/videoStore";

// One page per PUBLISHED video, read from Redis on each request (drafts and unknown IDs are a 404).
// Metadata is English (language isn't known server-side).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const v = getVideo(id, await loadPublished());
  if (!v) return { title: "Video — Atlas Trading" };
  const title = `${v.title.en} — Atlas Trading`;
  const description = v.description.en || v.title.en; // description is optional in the admin form
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${videoPagePath(v.id)}` },
    openGraph: { title, description, type: "video.other", url: `${SITE_URL}${videoPagePath(v.id)}`, images: [thumbHigh(v.id)] },
    twitter: { card: "summary_large_image", title, description, images: [thumbHigh(v.id)] },
  };
}

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await loadPublished();
  const video = getVideo(id, list);
  if (!video) notFound();

  // Structured data so search engines can show the video. "<" is escaped so the JSON can never close the script tag.
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title.en,
    description: video.description.en || video.title.en,
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
