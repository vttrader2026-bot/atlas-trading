// VIDEO-ADMIN-v1: edit / publish / unpublish (PATCH) and delete (DELETE) one video. Owner only. The YouTube ID is the key and never changes.
import { NextResponse } from "next/server";
import { auditLog, needsConfirm, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { getRedis } from "@/lib/redis";
import { deleteVideo, parseVideoFields, updateVideo, type VideoRedis } from "@/lib/videoStore";
import { ID_RE } from "@/lib/videos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

export async function PATCH(req: Request, { params }: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  if (!ID_RE.test(id)) return bad("Invalid video id.");
  const body = await readBody(req);
  if (!body) return bad("Invalid request.");
  const fields = parseVideoFields(body, true);
  if (!fields.ok) return bad(fields.error);
  if (Object.keys(fields.value).length === 0) return bad("Nothing to change.");
  const redis = getRedis();
  if (!redis) return bad("Server not configured (Redis is missing).", 500);
  try {
    const video = await updateVideo(redis as unknown as VideoRedis, id, fields.value);
    if (!video) return bad("Video not found.", 404);
    const only = Object.keys(fields.value).length === 1 && fields.value.status;
    await auditLog(redis, owner.userId, only ? `video.${fields.value.status === "published" ? "publish" : "unpublish"}` : "video.edit", id);
    return NextResponse.json({ ok: true, video }, { headers: noStore });
  } catch (err) {
    console.error("admin/videos update failed", err);
    return bad("Could not save the changes. Try again.", 500);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  if (!ID_RE.test(id)) return bad("Invalid video id.");
  const body = (await readBody(req)) ?? {};
  const denied = needsConfirm(body);
  if (denied) return denied;
  const redis = getRedis();
  if (!redis) return bad("Server not configured (Redis is missing).", 500);
  try {
    if (!(await deleteVideo(redis as unknown as VideoRedis, id))) return bad("Video not found.", 404);
    await auditLog(redis, owner.userId, "video.delete", id);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (err) {
    console.error("admin/videos delete failed", err);
    return bad("Could not delete the video. Try again.", 500);
  }
}
