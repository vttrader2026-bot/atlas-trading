// VIDEO-ALERTS-v1: video announcements. The admin publishes one (optionally with a push notification); members see them in
// the Video Alerts section of /account even if they were offline when the push went out.
//
// Storage (existing Upstash Redis):
//   atlas:video-alerts                      hash   field = YouTube ID, value = VideoAlert JSON (HSETNX: one alert per video)
//   user:<id>:video-alerts-read             set    YouTube IDs this member marked as read
//   push:video-alert:<id>                   string push claim: SET NX while sending, then 30 days. One notification per video.
import { PUSH_USERS_KEY, sendToUser } from "@/lib/push";
import { normalizePrefs } from "@/lib/notificationPrefs";
import { ID_RE, parseYouTubeId, thumbMedium, youtubeWatchUrl } from "@/lib/videos";
import { LIMITS, alertPayload, type PushResult, type PushState, type PublicAlert, type VideoAlert } from "@/lib/videoAlertsShared";
export * from "@/lib/videoAlertsShared";

export const ALERTS_KEY = "atlas:video-alerts";
export const alertClaimKey = (id: string) => `push:video-alert:${id}`;
export const readKey = (userId: string) => `user:${userId}:video-alerts-read`;
export const ALERT_CLAIM_TTL = 60 * 5; // while sending
export const ALERT_DONE_TTL = 60 * 60 * 24 * 30; // after sending: the duplicate guard
export const ALERT_PUSH_TTL = 60 * 60 * 24; // a phone that was off still gets it for a day
export const FEED_LIMIT = 50;
export type AlertRedis = {
  hgetall: <T>(k: string) => Promise<T | null>;
  hget: <T>(k: string, f: string) => Promise<T | null>;
  hset: (k: string, o: Record<string, unknown>) => Promise<unknown>;
  hsetnx: (k: string, f: string, v: unknown) => Promise<unknown>;
  hdel: (k: string, ...f: string[]) => Promise<unknown>;
  get: <T>(k: string) => Promise<T | null>;
  set: (k: string, v: unknown, o?: { nx?: boolean; ex?: number }) => Promise<unknown>;
  del: (...k: string[]) => Promise<unknown>;
  expire: (k: string, s: number) => Promise<unknown>;
  smembers: <T>(k: string) => Promise<T>;
  sadd: (k: string, ...m: string[]) => Promise<unknown>;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const text = (v: unknown) => (typeof v === "string" ? v.replace(CONTROL, "").trim() : "");

export function parseThumbnail(input: unknown): Parsed<string | null> {
  if (input === undefined || input === null || (typeof input === "string" && !input.trim())) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "Thumbnail must be an image link." };
  if (input.length > LIMITS.thumb) return { ok: false, error: "The thumbnail link is too long." };
  try {
    const u = new URL(input.trim());
    if (u.protocol !== "https:" || u.username || u.password) throw new Error("scheme");
    return { ok: true, value: u.toString() };
  } catch {
    return { ok: false, error: "The thumbnail must be a full https:// image link (or leave it empty to use the YouTube thumbnail)." };
  }
}

export function parseAlertInput(body: Record<string, unknown>): Parsed<{ id: string; title: string; description: string; thumbnail: string | null }> {
  if (typeof body.url !== "string" || !body.url.trim()) return { ok: false, error: "Paste a YouTube link." };
  if (body.url.length > LIMITS.url) return { ok: false, error: "That link is too long." };
  const id = parseYouTubeId(body.url);
  if (!id) return { ok: false, error: "That doesn't look like a YouTube video link. Use a watch, youtu.be, Shorts or embed link." };
  for (const [k, label] of [["title", "Title"], ["description", "Description"]] as const) {
    if (body[k] !== undefined && typeof body[k] !== "string") return { ok: false, error: `${label} must be text.` };
  }
  const title = text(body.title);
  const description = text(body.description);
  if (!title) return { ok: false, error: "Add a title." };
  if (title.length > LIMITS.title) return { ok: false, error: `Title is too long (max ${LIMITS.title} characters).` };
  if (description.length > LIMITS.description) return { ok: false, error: `Description is too long (max ${LIMITS.description} characters).` };
  const thumb = parseThumbnail(body.thumbnail);
  if (!thumb.ok) return thumb;
  return { ok: true, value: { id, title, description, thumbnail: thumb.value } };
}

function normalize(raw: unknown): VideoAlert | null {
  let v = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || !ID_RE.test(o.id) || typeof o.title !== "string" || !o.title) return null;
  if (o.status !== "published" && o.status !== "unpublished") return null;
  const thumb = typeof o.thumbnail === "string" && parseThumbnail(o.thumbnail).ok ? o.thumbnail : null;
  const p = o.push as Record<string, unknown> | null | undefined;
  const states: PushState[] = ["sent", "nobody", "not-configured", "error", "duplicate"];
  const push: PushResult | null = p && typeof p === "object" && states.includes(p.state as PushState)
    ? { state: p.state as PushState, users: Number(p.users) || 0, devices: Number(p.devices) || 0, at: Number(p.at) || 0 }
    : null;
  return {
    id: o.id, title: o.title, description: typeof o.description === "string" ? o.description : "", thumbnail: thumb, status: o.status,
    createdAt: Number(o.createdAt) || 0, publishedAt: Number(o.publishedAt) || 0, push,
  };
}

export async function readAlerts(redis: AlertRedis): Promise<VideoAlert[]> {
  const all = await redis.hgetall<Record<string, unknown>>(ALERTS_KEY);
  return Object.values(all ?? {}).map(normalize).filter((a): a is VideoAlert => !!a).sort((a, b) => b.publishedAt - a.publishedAt || (a.id < b.id ? -1 : 1));
}

export const toPublic = (a: VideoAlert): PublicAlert => ({
  id: a.id, title: a.title, description: a.description, thumbnail: a.thumbnail ?? thumbMedium(a.id), url: youtubeWatchUrl(a.id), publishedAt: a.publishedAt,
});

export async function publishedAlerts(redis: AlertRedis): Promise<VideoAlert[]> {
  return (await readAlerts(redis)).filter((a) => a.status === "published").slice(0, FEED_LIMIT);
}

export async function getAlert(redis: AlertRedis, id: string): Promise<VideoAlert | null> {
  return normalize(await redis.hget<unknown>(ALERTS_KEY, id));
}

export async function createAlert(redis: AlertRedis, v: { id: string; title: string; description: string; thumbnail: string | null }, now = Date.now()): Promise<{ ok: true; alert: VideoAlert } | { ok: false; reason: "duplicate" }> {
  const alert: VideoAlert = { ...v, status: "published", createdAt: now, publishedAt: now, push: null };
  const created = await redis.hsetnx(ALERTS_KEY, v.id, alert);
  return created ? { ok: true, alert } : { ok: false, reason: "duplicate" };
}

export async function saveAlert(redis: AlertRedis, alert: VideoAlert): Promise<void> {
  await redis.hset(ALERTS_KEY, { [alert.id]: alert });
}

export async function deleteAlert(redis: AlertRedis, id: string): Promise<boolean> {
  return Number(await redis.hdel(ALERTS_KEY, id)) > 0;
}

const vapidReady = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

/**
 * Sends the push for one video, at most once. Only members whose notifications are switched on are contacted; sendToUser
 * skips members without a subscription and deletes expired subscriptions (404/410) on its own. If nobody was reached the
 * claim is released so the admin can retry; once anybody received it the claim stays for 30 days (no duplicates).
 */
export async function notifyVideoAlert(redis: AlertRedis, alert: VideoAlert, send: typeof sendToUser = sendToUser): Promise<PushResult> {
  const result = (state: PushState, users = 0, devices = 0): PushResult => ({ state, users, devices, at: Date.now() });
  if (!vapidReady()) return result("not-configured");
  const claim = alertClaimKey(alert.id);
  let claimed = false;
  let users = 0, devices = 0;
  try {
    if (!(await redis.set(claim, "1", { nx: true, ex: ALERT_CLAIM_TTL }))) return result("duplicate");
    claimed = true;
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      await Promise.allSettled(userIds.slice(i, i + 20).map(async (userId) => {
        const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
        if (!prefs.enabled) return;
        const n = await send(userId, () => alertPayload(alert), ALERT_PUSH_TTL);
        if (n > 0) { users++; devices += n; }
      }));
    }
    if (devices === 0) { await redis.del(claim).catch(() => 0); return result("nobody"); }
    await redis.expire(claim, ALERT_DONE_TTL).catch(() => 0);
    return result("sent", users, devices);
  } catch (err) {
    console.error("video-alerts: notify failed", err);
    if (claimed && devices === 0) await redis.del(claim).catch(() => 0);
    return result("error", users, devices);
  }
}

