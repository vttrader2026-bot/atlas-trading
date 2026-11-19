// VIDEO-ALERTS-v1: owner-only. GET = every announcement (including unpublished); POST = publish a new one and, unless
// switched off, send the push notification. Regular members get a 404 from requireOwner on every method.
import { NextResponse } from "next/server";
import { auditLog, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { getRedis } from "@/lib/redis";
import { createAlert, describePush, notifyVideoAlert, parseAlertInput, readAlerts, saveAlert, type AlertRedis } from "@/lib/videoAlerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noRedis = () => NextResponse.json({ error: "Server not configured (Redis is missing)." }, { status: 500, headers: noStore });

export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const redis = getRedis();
  if (!redis) return noRedis();
  try {
    return NextResponse.json({ alerts: await readAlerts(redis as unknown as AlertRedis) }, { headers: noStore });
  } catch (err) {
    console.error("admin/video-alerts list failed", err);
    return NextResponse.json({ error: "Could not load the announcements. Try again." }, { status: 500, headers: noStore });
  }
}

export async function POST(req: Request) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: noStore });
  const parsed = parseAlertInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: noStore });
  if (body.notify !== undefined && typeof body.notify !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: noStore });
  const redis = getRedis();
  if (!redis) return noRedis();
  const r = redis as unknown as AlertRedis;
  try {
    const created = await createAlert(r, parsed.value);
    if (!created.ok) return NextResponse.json({ error: "This video already has an announcement. Delete it first, or use Send notification on it." }, { status: 409, headers: noStore });
    let alert = created.alert;
    await auditLog(redis, owner.userId, "video-alert.publish", alert.id, { title: alert.title });
    let message = "Announcement published. Members can see it in Video Alerts.";
    if (body.notify !== false) {
      const push = await notifyVideoAlert(r, alert);
      alert = { ...alert, push };
      await saveAlert(r, alert);
      await auditLog(redis, owner.userId, "video-alert.notify", alert.id, { state: push.state, users: push.users, devices: push.devices });
      message = describePush(push);
    }
    return NextResponse.json({ ok: true, alert, message }, { status: 201, headers: noStore });
  } catch (err) {
    console.error("admin/video-alerts create failed", err);
    return NextResponse.json({ error: "Could not publish the announcement. Try again." }, { status: 500, headers: noStore });
  }
}
