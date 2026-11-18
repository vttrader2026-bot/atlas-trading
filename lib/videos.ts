// VIDEOS — shared types and helpers for the ATLAS video library.
//
// The library is MANAGED IN THE BROWSER at /admin/videos (owner only) and stored in Redis (see lib/videoStore.ts).
// You no longer edit this file to add videos. SEED_VIDEOS below is only the one-time starting content that is copied
// into Redis the first time the library is read; after that, changes made in the admin page are the source of truth.

export type Lang = "en" | "ar" | "fr";
export type Localized = { en: string; ar?: string; fr?: string };
export type VideoCategory = "tutorials" | "updates" | "analysis" | "academy";

export type VideoEntry = {
  url: string;
  title: string | Localized;
  description: string | Localized;
  category?: VideoCategory;
  date?: string;
};

/** One-time migration seed (do not add new videos here: use /admin/videos). */
export const SEED_VIDEOS: VideoEntry[] = [
  {
    url: "https://youtu.be/49OpWJEADlI",
    title: {
      en: "How to Start Investing in Cryptocurrency | ATLAS TRADING",
      ar: "كيف تبدأ الاستثمار في العملات الرقمية من الصفر؟ 🚀 | دليلك مع Atlas Trading",
      fr: "Comment commencer à investir dans les cryptomonnaies | ATLAS TRADING",
    },
    description: {
      en: "Discover cryptocurrency investing and get started with ATLAS TRADING.",
      ar: "اكتشف عالم الاستثمار في العملات الرقمية وتعرّف على كيفية البدء مع أطلس تريدينغ.",
      fr: "Découvrez l'investissement dans les cryptomonnaies et apprenez à débuter avec ATLAS TRADING.",
    },
    category: "tutorials",
    date: "2026-11-18",
  },
];

export const CATEGORY_ORDER: VideoCategory[] = ["tutorials", "updates", "analysis", "academy"];
export const CATEGORY_LABELS: Record<VideoCategory, Record<Lang, string>> = {
  tutorials: { en: "Trading tutorials", ar: "دروس التداول", fr: "Tutoriels de trading" },
  updates: { en: "Atlas Trading updates", ar: "تحديثات أطلس", fr: "Actualités Atlas Trading" },
  analysis: { en: "Market analysis", ar: "تحليل السوق", fr: "Analyse de marché" },
  academy: { en: "Academy lessons", ar: "دروس الأكاديمية", fr: "Leçons de l'Académie" },
};

/** What the pages receive: plain, serializable, with the YouTube ID resolved. */
export type Video = {
  id: string;
  title: Localized;
  description: Localized;
  category: VideoCategory | null;
  date: string | null;
};

/** A video as stored in Redis: the public fields plus what only the admin needs. */
export type VideoStatus = "published" | "draft";
export type StoredVideo = Video & { status: VideoStatus; position: number; createdAt: number; updatedAt: number };

export const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Accepts a YouTube watch / youtu.be / shorts / embed / live link, or a bare 11-character ID. Returns the ID or null. */
export function parseYouTubeId(input: string): string | null {
  const raw = (input ?? "").trim();
  if (ID_RE.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(parts[0])) id = parts[1] ?? null;
  }
  return id && ID_RE.test(id) ? id : null;
}

const asLocalized = (v: string | Localized): Localized => (typeof v === "string" ? { en: v } : v);
/** Text in the visitor's language, falling back to English. */
export const pick = (l: Localized, lang: Lang): string => (l[lang] || l.en) ?? "";

const validDate = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null);

/** Resolves entries into videos: invalid links are dropped, duplicates keep the first, newest first (undated last, file order kept). */
export function buildVideos(entries: VideoEntry[]): Video[] {
  const seen = new Set<string>();
  const out: Video[] = [];
  for (const e of entries) {
    const id = parseYouTubeId(e.url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: asLocalized(e.title),
      description: asLocalized(e.description),
      category: e.category && CATEGORY_ORDER.includes(e.category) ? e.category : null,
      date: validDate(e.date),
    });
  }
  return out
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (a.v.date && b.v.date ? (a.v.date < b.v.date ? 1 : a.v.date > b.v.date ? -1 : a.i - b.i) : a.v.date ? -1 : b.v.date ? 1 : a.i - b.i))
    .map((x) => x.v);
}

export const getVideo = (id: string, list: Video[]): Video | undefined => list.find((v) => v.id === id);

/** Up to `limit` other videos: same category first, then the rest (already newest first). */
export function relatedVideos(current: Video, list: Video[], limit = 4): Video[] {
  const others = list.filter((v) => v.id !== current.id);
  const same = others.filter((v) => current.category && v.category === current.category);
  return [...same, ...others.filter((v) => !same.includes(v))].slice(0, limit);
}

/** Categories that actually have videos, in the fixed display order. */
export const usedCategories = (list: Video[]): VideoCategory[] => CATEGORY_ORDER.filter((c) => list.some((v) => v.category === c));

// Thumbnails: YouTube serves them for every video, so there is nothing to upload or store.
export const thumbHigh = (id: string) => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`; // true 16:9, may be missing on small uploads
export const thumbMedium = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`; // true 16:9, always present
export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const youtubeEmbedUrl = (id: string, autoplay = false) =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1${autoplay ? "&autoplay=1" : ""}`;
export const SITE_URL = "https://www.atlastrading.app";
export const videoPagePath = (id: string) => `/videos/${id}`;
