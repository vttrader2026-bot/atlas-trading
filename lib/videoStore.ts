// VIDEO-STORE-v1: persistent video library in the existing Upstash Redis (no new service).
//   atlas:videos         HASH  field = YouTube ID, value = one StoredVideo (JSON)
//   atlas:videos:seeded  flag  set once the legacy lib/videos.ts entries were copied in (so a deleted video never comes back)
// Public reads only ever return PUBLISHED videos. All writes come from the owner-only routes in app/api/admin/videos.
// This file is server-only logic; the Redis client is passed in, so it is easy to test with a fake.
import { cache } from "react";
import { getRedis } from "@/lib/redis";
import {
  CATEGORY_ORDER, SEED_VIDEOS, buildVideos, parseYouTubeId, ID_RE,
  type Localized, type StoredVideo, type Video, type VideoCategory, type VideoStatus,
} from "@/lib/videos";

export const VIDEOS_KEY = "atlas:videos";
export const VIDEOS_SEEDED_KEY = "atlas:videos:seeded";

/** The few Redis commands this module uses (the real @upstash/redis client satisfies it). */
export type VideoRedis = {
  hgetall: <T = unknown>(key: string) => Promise<Record<string, T> | null>;
  hget: <T = unknown>(key: string, field: string) => Promise<T | null>;
  hset: (key: string, values: Record<string, unknown>) => Promise<unknown>;
  hsetnx: (key: string, field: string, value: unknown) => Promise<unknown>;
  hdel: (key: string, ...fields: string[]) => Promise<unknown>;
  get: <T = unknown>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown) => Promise<unknown>;
};

// ---------- input validation (server-side; the form's checks are only a convenience) ----------

const LIMITS = { title: 120, description: 800, url: 300 } as const;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\r\n/g, "\n").replace(CONTROL, "").trim().slice(0, max) : "");
const tooLong = (v: unknown, max: number) => typeof v === "string" && v.replace(CONTROL, "").trim().length > max;

export type VideoFields = {
  title: Localized;
  description: Localized;
  category: VideoCategory | null;
  date: string | null;
  status: VideoStatus;
};
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function localized(body: Record<string, unknown>, prefix: "title" | "description", max: number): Localized {
  const en = clean(body[`${prefix}En`], max), ar = clean(body[`${prefix}Ar`], max), fr = clean(body[`${prefix}Fr`], max);
  return { en, ...(ar ? { ar } : {}), ...(fr ? { fr } : {}) };
}

export function validDate(d: unknown): d is string {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** Validates the YouTube link and returns its ID. */
export function parseVideoUrl(input: unknown): Parsed<string> {
  if (typeof input !== "string" || !input.trim()) return { ok: false, error: "Paste a YouTube link." };
  if (input.length > LIMITS.url) return { ok: false, error: "That link is too long." };
  const id = parseYouTubeId(input);
  return id ? { ok: true, value: id } : { ok: false, error: "That doesn't look like a YouTube video link. Use a watch, youtu.be, Shorts or embed link." };
}

/** Validates the editable fields. With `partial`, only the fields present in `body` are checked and returned. */
export function parseVideoFields(body: Record<string, unknown>, partial = false): Parsed<Partial<VideoFields>> {
  const out: Partial<VideoFields> = {};
  const has = (k: string) => k in body;

  for (const [k, max, label] of [["titleEn", LIMITS.title, "English title"], ["titleAr", LIMITS.title, "Arabic title"], ["titleFr", LIMITS.title, "French title"], ["descriptionEn", LIMITS.description, "English description"], ["descriptionAr", LIMITS.description, "Arabic description"], ["descriptionFr", LIMITS.description, "French description"]] as const) {
    if (body[k] !== undefined && typeof body[k] !== "string") return { ok: false, error: `${label} must be text.` };
    if (tooLong(body[k], max)) return { ok: false, error: `${label} is too long (max ${max} characters).` };
  }

  if (!partial || ["titleEn", "titleAr", "titleFr"].some(has)) {
    const title = localized(body, "title", LIMITS.title);
    if (!title.en) return { ok: false, error: "Add an English title." };
    out.title = title;
  }
  if (!partial || ["descriptionEn", "descriptionAr", "descriptionFr"].some(has)) out.description = localized(body, "description", LIMITS.description);

  if (!partial || has("category")) {
    const c = body.category;
    if (c === undefined || c === null || c === "") out.category = null;
    else if (typeof c === "string" && (CATEGORY_ORDER as string[]).includes(c)) out.category = c as VideoCategory;
    else return { ok: false, error: "Choose a valid category." };
  }
  if (!partial || has("date")) {
    const d = body.date;
    if (d === undefined || d === null || d === "") out.date = null;
    else if (validDate(d)) out.date = d;
    else return { ok: false, error: "Use a real date (YYYY-MM-DD)." };
  }
  if (!partial || has("status")) {
    const s = body.status;
    if (s === "published" || s === "draft") out.status = s;
    else return { ok: false, error: "Choose Published or Draft." };
  }
  return { ok: true, value: out };
}

// ---------- reading ----------

/** Defensive: a malformed record is dropped, never shown. */
export function normalizeRecord(raw: unknown, idHint?: string): StoredVideo | null {
  let r = raw;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch { return null; } }
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : idHint;
  if (!id || !ID_RE.test(id)) return null;
  const loc = (v: unknown): Localized | null => {
    if (!v || typeof v !== "object") return null;
    const l = v as Record<string, unknown>;
    if (typeof l.en !== "string") return null;
    return { en: l.en, ...(typeof l.ar === "string" && l.ar ? { ar: l.ar } : {}), ...(typeof l.fr === "string" && l.fr ? { fr: l.fr } : {}) };
  };
  const title = loc(o.title), description = loc(o.description) ?? { en: "" };
  if (!title || !title.en) return null;
  return {
    id, title, description,
    category: typeof o.category === "string" && (CATEGORY_ORDER as string[]).includes(o.category) ? (o.category as VideoCategory) : null,
    date: validDate(o.date) ? o.date : null,
    status: o.status === "published" ? "published" : "draft", // anything unclear stays private
    position: typeof o.position === "number" && Number.isFinite(o.position) ? o.position : 0,
    createdAt: typeof o.createdAt === "number" ? o.createdAt : 0,
    updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : 0,
  };
}

const byPosition = (a: StoredVideo, b: StoredVideo) => a.position - b.position || b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1);

/** Copies the legacy lib/videos.ts entries into Redis once. HSETNX means an existing video is never overwritten or duplicated. */
export async function seedIfNeeded(redis: VideoRedis, now = Date.now()): Promise<void> {
  if (await redis.get(VIDEOS_SEEDED_KEY)) return;
  const seeds = buildVideos(SEED_VIDEOS);
  for (const [i, v] of seeds.entries()) {
    const rec: StoredVideo = { ...v, status: "published", position: i, createdAt: v.date ? Date.parse(`${v.date}T00:00:00Z`) || now : now, updatedAt: now };
    await redis.hsetnx(VIDEOS_KEY, v.id, rec);
  }
  await redis.set(VIDEOS_SEEDED_KEY, "1");
}

/** Every video (drafts included), in display order. Admin use only. */
export async function readAll(redis: VideoRedis): Promise<StoredVideo[]> {
  let raw = await redis.hgetall(VIDEOS_KEY);
  if (!raw || Object.keys(raw).length === 0) {
    await seedIfNeeded(redis);
    raw = await redis.hgetall(VIDEOS_KEY);
  }
  return Object.entries(raw ?? {}).map(([id, v]) => normalizeRecord(v, id)).filter((v): v is StoredVideo => !!v).sort(byPosition);
}

/** What the public may see: published only, with admin-only fields stripped. */
export const toPublic = (v: StoredVideo): Video => ({ id: v.id, title: v.title, description: v.description, category: v.category, date: v.date });
export const publishedOnly = (all: StoredVideo[]): Video[] => all.filter((v) => v.status === "published").map(toPublic);

// ---------- writing ----------

export type CreateResult = { ok: true; video: StoredVideo } | { ok: false; reason: "duplicate" };

export async function createVideo(redis: VideoRedis, id: string, fields: VideoFields, now = Date.now()): Promise<CreateResult> {
  const all = await readAll(redis); // also runs the one-time migration before the first manual add
  if (all.some((v) => v.id === id)) return { ok: false, reason: "duplicate" };
  const position = all.length ? Math.min(...all.map((v) => v.position)) - 1 : 0; // new videos go first; the owner can move them
  const video: StoredVideo = { id, ...fields, position, createdAt: now, updatedAt: now };
  const added = await redis.hsetnx(VIDEOS_KEY, id, video); // atomic: loses the race rather than overwriting
  if (added === 0 || added === false) return { ok: false, reason: "duplicate" };
  return { ok: true, video };
}

export async function updateVideo(redis: VideoRedis, id: string, patch: Partial<VideoFields>, now = Date.now()): Promise<StoredVideo | null> {
  const cur = normalizeRecord(await redis.hget(VIDEOS_KEY, id), id);
  if (!cur) return null;
  const next: StoredVideo = { ...cur, ...patch, id, updatedAt: now }; // the YouTube ID never changes
  await redis.hset(VIDEOS_KEY, { [id]: next });
  return next;
}

export async function deleteVideo(redis: VideoRedis, id: string): Promise<boolean> {
  const n = await redis.hdel(VIDEOS_KEY, id);
  return Number(n) > 0;
}

/** Swaps a video with its neighbour. Positions are renumbered 0..n-1 in one atomic HSET. */
export async function moveVideo(redis: VideoRedis, id: string, direction: "up" | "down", now = Date.now()): Promise<StoredVideo[] | null> {
  const all = await readAll(redis);
  const i = all.findIndex((v) => v.id === id);
  if (i < 0) return null;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j >= 0 && j < all.length) [all[i], all[j]] = [all[j], all[i]];
  const next = all.map((v, n) => ({ ...v, position: n, updatedAt: v.position === n ? v.updatedAt : now }));
  await redis.hset(VIDEOS_KEY, Object.fromEntries(next.map((v) => [v.id, v])));
  return next;
}

// ---------- public loaders (used by the pages and the sitemap) ----------

/** Published videos for the public site. If Redis is missing or fails, returns [] rather than ever risking a draft. */
// cache(): the page and its metadata share one Redis read per request.
export const loadPublished = cache(async (): Promise<Video[]> => {
  const redis = getRedis();
  if (!redis) return [];
  try {
    return publishedOnly(await readAll(redis as unknown as VideoRedis));
  } catch (err) {
    console.error("videos: could not load the library", err);
    return [];
  }
});
