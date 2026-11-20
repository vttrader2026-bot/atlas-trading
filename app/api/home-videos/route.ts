// HOME-VIDEOS-v1: the 3 latest PUBLISHED videos for the homepage section. Same source as /videos (loadPublished: Redis,
// published-only, [] on any failure), so drafts and unpublished videos can never appear and there is no second data store.
import { NextResponse } from "next/server";
import { loadPublished } from "@/lib/videoStore";

export const dynamic = "force-dynamic";
export const HOME_VIDEO_COUNT = 3;

export async function GET() {
  const latest = (await loadPublished())
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (b.v.publishedAt ?? 0) - (a.v.publishedAt ?? 0) || a.i - b.i) // newest first; library order breaks ties
    .slice(0, HOME_VIDEO_COUNT)
    .map(({ v }) => v);
  return NextResponse.json(
    { videos: latest },
    // Short shared cache keeps the homepage fast; a newly published video shows within about a minute.
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
  );
}
