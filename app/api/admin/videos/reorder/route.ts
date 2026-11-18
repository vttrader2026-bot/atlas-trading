// VIDEO-ADMIN-v1: move a video one place up or down in the public order. Owner only.
import { NextResponse } from "next/server";
import { auditLog, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { getRedis } from "@/lib/redis";
import { moveVideo, type VideoRedis } from "@/lib/videoStore";
import { ID_RE } from "@/lib/videos";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  const id = body?.id, direction = body?.direction;
  if (typeof id !== "string" || !ID_RE.test(id) || (direction !== "up" && direction !== "down")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: noStore });
  }
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured (Redis is missing)." }, { status: 500, headers: noStore });
  try {
    const videos = await moveVideo(redis as unknown as VideoRedis, id, direction);
    if (!videos) return NextResponse.json({ error: "Video not found." }, { status: 404, headers: noStore });
    await auditLog(redis, owner.userId, "video.move", id, { direction });
    return NextResponse.json({ ok: true, videos }, { headers: noStore });
  } catch (err) {
    console.error("admin/videos reorder failed", err);
    return NextResponse.json({ error: "Could not change the order. Try again." }, { status: 500, headers: noStore });
  }
}
