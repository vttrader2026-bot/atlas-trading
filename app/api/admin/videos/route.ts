// VIDEO-ADMIN-v1: list and add videos. Owner only (requireOwner: Clerk user id === OWNER_CLERK_USER_ID, same-site origin for writes).
// Strangers and non-owners get the same 404 as any unknown URL. Every input is validated here, whatever the browser form did.
import { NextResponse } from "next/server";
import { auditLog, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { getRedis } from "@/lib/redis";
import { createVideo, parseVideoFields, parseVideoUrl, readAll, type VideoFields, type VideoRedis } from "@/lib/videoStore";

export const dynamic = "force-dynamic";

const notConfigured = () => NextResponse.json({ error: "Server not configured (Redis is missing)." }, { status: 500, headers: noStore });

export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const redis = getRedis();
  if (!redis) return notConfigured();
  try {
    return NextResponse.json({ videos: await readAll(redis as unknown as VideoRedis) }, { headers: noStore });
  } catch (err) {
    console.error("admin/videos list failed", err);
    return NextResponse.json({ error: "Could not load the videos." }, { status: 500, headers: noStore });
  }
}

export async function POST(req: Request) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: noStore });
  const url = parseVideoUrl(body.url);
  if (!url.ok) return NextResponse.json({ error: url.error }, { status: 400, headers: noStore });
  const fields = parseVideoFields(body);
  if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400, headers: noStore });
  const redis = getRedis();
  if (!redis) return notConfigured();
  try {
    const res = await createVideo(redis as unknown as VideoRedis, url.value, fields.value as VideoFields);
    if (!res.ok) return NextResponse.json({ error: "This YouTube video is already in the library. Edit it instead." }, { status: 409, headers: noStore });
    await auditLog(redis, owner.userId, "video.create", url.value, { status: res.video.status });
    return NextResponse.json({ ok: true, video: res.video }, { status: 201, headers: noStore });
  } catch (err) {
    console.error("admin/videos create failed", err);
    return NextResponse.json({ error: "Could not save the video. Try again." }, { status: 500, headers: noStore });
  }
}
