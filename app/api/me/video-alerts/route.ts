// VIDEO-ALERTS-v1: a signed-in member's view of the published announcements. GET lists them (newest first) with a `read` flag
// per member; POST marks some or all as read. A member can only ever change their own read list.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";
import { ID_RE } from "@/lib/videos";
import { publishedAlerts, readKey, toPublic, type AlertRedis } from "@/lib/videoAlerts";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  const r = ctx.redis as unknown as AlertRedis;
  try {
    const [alerts, readIds] = await Promise.all([publishedAlerts(r), r.smembers<string[]>(readKey(ctx.userId))]);
    const read = new Set(readIds ?? []);
    const list = alerts.map((a) => ({ ...toPublic(a), read: read.has(a.id) }));
    return NextResponse.json({ alerts: list, unread: list.filter((a) => !a.read).length }, { headers });
  } catch (err) {
    console.error("me/video-alerts failed", err);
    return NextResponse.json({ error: "Could not load video alerts." }, { status: 500, headers });
  }
}

export async function POST(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  let body: { ids?: unknown; all?: unknown } | null = null;
  try { body = await req.json(); } catch { body = null; }
  const r = ctx.redis as unknown as AlertRedis;
  try {
    let ids: string[];
    if (body?.all === true) ids = (await publishedAlerts(r)).map((a) => a.id);
    else if (Array.isArray(body?.ids) && body.ids.length <= 100 && body.ids.every((i) => typeof i === "string" && ID_RE.test(i))) ids = [...new Set(body.ids as string[])];
    else return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
    if (ids.length) await r.sadd(readKey(ctx.userId), ...ids);
    return NextResponse.json({ ok: true, marked: ids.length }, { headers });
  } catch (err) {
    console.error("me/video-alerts mark-read failed", err);
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 500, headers });
  }
}
