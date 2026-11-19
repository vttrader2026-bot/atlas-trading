// VIDEO-ALERTS-v1: owner-only. PATCH { status } publishes / unpublishes (never re-sends a push), PATCH { notify: true } sends
// the push for an announcement that has not been notified yet. DELETE needs { confirm: true }.
import { NextResponse } from "next/server";
import { auditLog, needsConfirm, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { getRedis } from "@/lib/redis";
import { ID_RE } from "@/lib/videos";
import { deleteAlert, describePush, getAlert, notifyVideoAlert, saveAlert, type AlertRedis } from "@/lib/videoAlerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

export async function PATCH(req: Request, ctx: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail("Invalid video id.", 400);
  const body = await readBody(req);
  const status = body?.status, notify = body?.notify;
  if (!body || (status === undefined && notify === undefined) || (status !== undefined && status !== "published" && status !== "unpublished") || (notify !== undefined && notify !== true)) {
    return fail("Invalid request.", 400);
  }
  const redis = getRedis();
  if (!redis) return fail("Server not configured (Redis is missing).", 500);
  const r = redis as unknown as AlertRedis;
  try {
    let alert = await getAlert(r, id);
    if (!alert) return fail("Announcement not found.", 404);
    let message = "Saved.";
    if (status !== undefined && status !== alert.status) {
      alert = { ...alert, status };
      await saveAlert(r, alert);
      await auditLog(redis, owner.userId, status === "published" ? "video-alert.republish" : "video-alert.unpublish", id);
      message = status === "published" ? "Published again. No new notification was sent." : "Unpublished. Members no longer see it.";
    }
    if (notify === true) {
      if (alert.status !== "published") return fail("Publish the announcement before sending a notification.", 400);
      if (alert.push?.state === "sent") return fail("A notification for this video was already sent.", 409);
      const push = await notifyVideoAlert(r, alert);
      if (push.state !== "duplicate") {
        alert = { ...alert, push };
        await saveAlert(r, alert);
      }
      await auditLog(redis, owner.userId, "video-alert.notify", id, { state: push.state, users: push.users, devices: push.devices });
      message = describePush(push);
    }
    return NextResponse.json({ ok: true, alert, message }, { headers: noStore });
  } catch (err) {
    console.error("admin/video-alerts update failed", err);
    return fail("Could not update the announcement. Try again.", 500);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail("Invalid video id.", 400);
  const body = await readBody(req);
  const refused = needsConfirm(body ?? {});
  if (refused) return refused;
  const redis = getRedis();
  if (!redis) return fail("Server not configured (Redis is missing).", 500);
  try {
    if (!(await deleteAlert(redis as unknown as AlertRedis, id))) return fail("Announcement not found.", 404);
    await auditLog(redis, owner.userId, "video-alert.delete", id);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (err) {
    console.error("admin/video-alerts delete failed", err);
    return fail("Could not delete the announcement. Try again.", 500);
  }
}
