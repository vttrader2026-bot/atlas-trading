// NEW-VIDEOS-v1: the bell's new-video indicator. GET = how many PUBLISHED videos went live (within the NEW period) since this
// member last opened the video library; POST = "I have seen them" (sets the member's own marker to now). No push is sent.
// Drafts can never be counted: it reads the same published-only loader as the public library.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";
import { isNewVideo } from "@/lib/videos";
import { loadPublished } from "@/lib/videoStore";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" } as const;
export const seenKey = (userId: string) => `user:${userId}:videos-seen`;

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const seen = Number(await ctx.redis.get(seenKey(ctx.userId))) || 0;
    const fresh = (await loadPublished())
      .filter((v) => isNewVideo(v) && (v.publishedAt ?? 0) > seen)
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
    return NextResponse.json({ count: fresh.length, latestId: fresh[0]?.id ?? null }, { headers });
  } catch (err) {
    console.error("me/new-videos failed", err);
    return NextResponse.json({ count: 0, latestId: null }, { headers }); // the indicator just stays off
  }
}

export async function POST() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    await ctx.redis.set(seenKey(ctx.userId), Date.now());
    return NextResponse.json({ ok: true }, { headers });
  } catch (err) {
    console.error("me/new-videos mark-seen failed", err);
    return NextResponse.json({ error: "Could not save." }, { status: 500, headers });
  }
}
