// HOME-VIDEOS-v1: homepage "Watch Atlas Videos" section.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";

const h = vi.hoisted(() => ({ lang: "en" as "en" | "ar" | "fr", hashes: {} as Record<string, Record<string, unknown>>, kv: {} as Record<string, unknown>, fail: false }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: null }) }));
vi.mock("@/lib/i18n", () => ({ useLanguage: () => ({ lang: h.lang, t: (k: string) => k }) }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async hgetall(k: string) { if (h.fail) throw new Error("down"); const v = h.hashes[k]; return v && Object.keys(v).length ? structuredClone(v) : null; }
    async get(k: string) { return structuredClone(h.kv[k] ?? null); }
  },
}));

import { GET } from "@/app/api/home-videos/route";
import { HomeVideosView } from "@/components/home/HomeVideos";
import { CHROME } from "@/components/videos/chrome";
import { VIDEOS_SEEDED_KEY } from "@/lib/videoStore";
import type { Video } from "@/lib/videos";

const ID = (c: string) => c.repeat(11);
const rec = (c: string, over: Record<string, unknown> = {}) => ({ id: ID(c), title: { en: `Title ${c}` }, description: { en: "" }, category: "tutorials", date: null, status: "published", position: 0, createdAt: 1, updatedAt: 1, publishedAt: 1, ...over });
const read = (p: string) => readFileSync(p, "utf8");

beforeEach(() => {
  h.lang = "en"; h.fail = false; h.kv = { [VIDEOS_SEEDED_KEY]: "1" };
  h.hashes = {};
  process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
});
const seed = (...r: ReturnType<typeof rec>[]) => { h.hashes["atlas:videos"] = Object.fromEntries(r.map((x) => [x.id, x])); };
const ids = async () => ((await (await GET()).json()) as { videos: Video[] }).videos.map((v) => v.id);

describe("GET /api/home-videos", () => {
  it("returns the 3 newest published videos, never drafts", async () => {
    seed(rec("a", { publishedAt: 100 }), rec("b", { publishedAt: 400 }), rec("c", { publishedAt: 300 }), rec("d", { publishedAt: 200 }), rec("e", { publishedAt: 900, status: "draft" }));
    expect(await ids()).toEqual([ID("b"), ID("c"), ID("d")]);
  });
  it("returns fewer when fewer are published, and an empty list when none or when Redis fails", async () => {
    seed(rec("a"), rec("b", { status: "draft" }));
    expect(await ids()).toEqual([ID("a")]);
    seed(rec("b", { status: "draft" }));
    expect(await ids()).toEqual([]);
    seed(rec("a")); h.fail = true;
    expect(await ids()).toEqual([]);
  });
  it("sends public fields only and is publicly cacheable", async () => {
    seed(rec("a"));
    const res = await GET();
    expect(res.headers.get("cache-control")).toMatch(/s-maxage/);
    const v = ((await res.json()) as { videos: Record<string, unknown>[] }).videos[0];
    expect(v).not.toHaveProperty("status"); expect(v).not.toHaveProperty("position"); expect(v).not.toHaveProperty("createdAt");
  });
});

describe("HomeVideosView", () => {
  const vids = ["a", "b", "c"].map((c) => ({ id: ID(c), title: { en: `Title ${c}`, ar: `عنوان ${c}`, fr: `Titre ${c}` }, description: { en: "", ar: "", fr: "" }, category: "tutorials", date: null, publishedAt: 1 }) as unknown as Video);
  const html = (videos: Video[] | null) => renderToStaticMarkup(createElement(HomeVideosView, { videos }));
  it("renders 3 cards linking to /videos/<id> plus a CTA to /videos, with no YouTube player", () => {
    const out = html(vids);
    for (const c of ["a", "b", "c"]) expect(out).toContain(`href="/videos/${ID(c)}"`);
    expect(out).toContain('href="/videos"');
    expect(out).toContain("Watch Atlas Videos"); expect(out).toContain("Watch All Videos");
    expect(out).not.toMatch(/<iframe|youtube\.com\/embed|youtube-nocookie/);
  });
  it("is localized in English, Arabic and French", () => {
    expect(CHROME.homeTitle).toMatchObject({ en: "Watch Atlas Videos", ar: "شاهد فيديوهات أطلس", fr: "Regardez les vidéos Atlas" });
    expect(CHROME.homeCta).toMatchObject({ en: "Watch All Videos", ar: "مشاهدة جميع الفيديوهات", fr: "Voir toutes les vidéos" });
    for (const l of ["ar", "fr"] as const) {
      h.lang = l; const out = html(vids).replaceAll("&#x27;", "'");
      expect(out).toContain(CHROME.homeTitle[l]); expect(out).toContain(CHROME.homeCta[l]); expect(out).toContain(CHROME.homeBody[l]);
    }
    h.lang = "ar"; expect(html(vids)).toContain("عنوان a");
  });
  it("shows a loading skeleton while fetching", () => { expect(html(null)).toContain("data-home-videos-loading"); });
});

describe("wiring", () => {
  it("is on the homepage after Community and before the membership block; reuses the library, no new video store", () => {
    const p = read("app/page.tsx");
    expect(p).toContain("<HomeVideos />");
    expect(p.indexOf("<CommunitySection />")).toBeLessThan(p.indexOf("<HomeVideos />"));
    expect(p.indexOf("<HomeVideos />")).toBeLessThan(p.indexOf("FINAL CTA"));
    const src = read("components/home/HomeVideos.tsx") + read("app/api/home-videos/route.ts");
    expect(src).toContain("loadPublished"); expect(src).toContain("VideoCard"); expect(src).not.toMatch(/hgetall|new Redis|<iframe/);
    expect(existsSync("app/api/videos")).toBe(false);
  });
});
