// VIDEOS-v1
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  VIDEOS, buildVideos, getVideos, getVideo, relatedVideos, usedCategories, parseYouTubeId, pick,
  youtubeEmbedUrl, youtubeWatchUrl, thumbHigh, thumbMedium, type VideoEntry,
} from "@/lib/videos";

const ID = "dQw4w9WgXcQ";
const read = (p: string) => readFileSync(p, "utf8");

describe("parseYouTubeId", () => {
  it("accepts every common YouTube link shape and a bare ID", () => {
    for (const u of [
      `https://www.youtube.com/watch?v=${ID}`, `https://youtube.com/watch?v=${ID}&t=42s`, `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`, `https://youtu.be/${ID}?si=abc`, `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`, `https://www.youtube-nocookie.com/embed/${ID}`, `https://www.youtube.com/live/${ID}`,
      `youtube.com/watch?v=${ID}`, `  ${ID}  `, ID,
    ]) expect(parseYouTubeId(u), u).toBe(ID);
  });
  it("rejects anything else", () => {
    for (const u of ["", "hello", "https://example.com/watch?v=" + ID, "https://www.youtube.com/watch?v=short", "https://www.youtube.com/", "https://youtu.be/", "https://evil.com/youtu.be/" + ID, "javascript:alert(1)"])
      expect(parseYouTubeId(u), u).toBeNull();
  });
});

describe("buildVideos", () => {
  const e = (url: string, over: Partial<VideoEntry> = {}): VideoEntry => ({ url, title: "T " + url.slice(-3), description: "D", ...over });
  it("drops invalid links and duplicate videos, keeps the first", () => {
    const v = buildVideos([e(ID), e("nope"), e(`https://youtu.be/${ID}`, { title: "dup" })]);
    expect(v.map((x) => x.id)).toEqual([ID]);
    expect(v[0].title.en).toBe("T " + ID.slice(-3));
  });
  it("sorts newest first, undated last, file order as tiebreak; ignores bad dates and categories", () => {
    const a = "aaaaaaaaaaa", b = "bbbbbbbbbbb", c = "ccccccccccc", d = "ddddddddddd", f = "fffffffffff";
    const v = buildVideos([e(a), e(b, { date: "2026-01-01" }), e(c, { date: "2026-03-01" }), e(d, { date: "2026-03-01" }), e(f, { date: "31/12/2026", category: "bogus" as never })]);
    expect(v.map((x) => x.id)).toEqual([c, d, b, a, f]);
    expect(v.find((x) => x.id === f)).toMatchObject({ date: null, category: null });
  });
  it("accepts plain strings or per-language objects, with English fallback", () => {
    const [v] = buildVideos([e(ID, { title: { en: "Hello", fr: "Bonjour" }, description: "Same everywhere" })]);
    expect(pick(v.title, "fr")).toBe("Bonjour");
    expect(pick(v.title, "ar")).toBe("Hello");
    expect(pick(v.description, "ar")).toBe("Same everywhere");
  });
  it("related: same category first, never the current video, capped", () => {
    const ids = Array.from({ length: 7 }, (_, i) => String(i).repeat(11));
    const list = buildVideos(ids.map((id, i) => e(id, { category: i % 2 ? "analysis" : "tutorials", date: `2026-02-0${i + 1}` })));
    const cur = list.find((x) => x.id === ids[0])!;
    const rel = relatedVideos(cur, list, 4);
    expect(rel).toHaveLength(4);
    expect(rel.some((x) => x.id === cur.id)).toBe(false);
    expect(rel.filter((x) => x.category === cur.category).length).toBe(3);
    expect(rel.slice(0, 3).every((x) => x.category === cur.category)).toBe(true);
    expect(usedCategories(list)).toEqual(["tutorials", "analysis"]);
    expect(getVideo(ids[3], list)?.id).toBe(ids[3]);
  });
});

describe("the shipped library", () => {
  it("every entry in VIDEOS has a valid YouTube link, a title and a description (so a typo is caught before deploy)", () => {
    VIDEOS.forEach((v, i) => {
      expect(parseYouTubeId(v.url), `VIDEOS[${i}].url`).not.toBeNull();
      expect(pick(typeof v.title === "string" ? { en: v.title } : v.title, "en").length, `VIDEOS[${i}].title`).toBeGreaterThan(0);
      expect(pick(typeof v.description === "string" ? { en: v.description } : v.description, "en").length, `VIDEOS[${i}].description`).toBeGreaterThan(0);
      if (v.date) expect(v.date, `VIDEOS[${i}].date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
    expect(getVideos()).toHaveLength(new Set(VIDEOS.map((v) => parseYouTubeId(v.url))).size);
  });
});

describe("URLs", () => {
  it("embeds with the privacy-friendly domain and only autoplays after a click", () => {
    expect(youtubeEmbedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0&modestbranding=1&playsinline=1`);
    expect(youtubeEmbedUrl(ID, true)).toContain("&autoplay=1");
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(thumbHigh(ID)).toBe(`https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`);
    expect(thumbMedium(ID)).toBe(`https://i.ytimg.com/vi/${ID}/mqdefault.jpg`);
  });
});

describe("pages and wiring", () => {
  it("the player is a click-to-load facade: the iframe exists only after play, in a 16:9 box", () => {
    const p = read("components/videos/VideoPlayer.tsx");
    expect(p.match(/<iframe/g)?.length).toBe(1);
    expect(p).toMatch(/playing \? \(\s*<iframe/);
    expect(p).toContain("aspect-video");
    expect(p).toContain("overflow-hidden");
    expect(p).toContain("youtubeEmbedUrl(id, true)");
    expect(p).toContain("allowFullScreen");
    expect(p).toContain('referrerPolicy="strict-origin-when-cross-origin"');
  });
  it("thumbnails are lazy and cards never mount a player", () => {
    expect(read("components/videos/VideoThumb.tsx")).toContain('loading="lazy"');
    expect(read("components/videos/VideoCard.tsx")).not.toContain("VideoPlayer");
    expect(read("components/videos/VideoLibrary.tsx")).not.toContain("<iframe");
    expect(read("components/videos/VideoLibrary.tsx")).not.toContain("VideoPlayer");
  });
  it("watch view: Watch on YouTube opens safely in a new tab, Share exists, related videos shown", () => {
    const w = read("components/videos/VideoWatch.tsx");
    expect(w).toContain("youtubeWatchUrl(video.id)");
    expect(w).toContain('target="_blank"');
    expect(w).toContain('rel="noopener noreferrer"');
    expect(w).toContain("navigator.share");
    expect(w).toContain("related.length > 0");
  });
  it("routes exist and the dynamic page pre-renders, escapes its JSON-LD and 404s unknown IDs", () => {
    expect(existsSync("app/videos/page.tsx")).toBe(true);
    const r = read("app/videos/[id]/page.tsx");
    expect(r).toContain("generateStaticParams");
    expect(r).toContain("generateMetadata");
    expect(r).toContain("notFound()");
    expect(r).toContain('"@type": "VideoObject"');
    expect(r).toContain('.replace(/</g, "\\\\u003c")');
  });
  it("is reachable: Academy card, footer link and sitemap; footer label exists in EN, AR, FR", () => {
    expect(read("components/academy/AcademyIndex.tsx")).toContain('href="/videos"');
    expect(read("components/Footer.tsx")).toContain('href: "/videos"');
    expect(read("app/sitemap.ts")).toContain('"/videos"');
    expect(read("app/sitemap.ts")).toContain("getVideos()");
    expect(read("lib/i18n.tsx").match(/\n    videos: "/g)?.length).toBe(3);
  });
  it("no database, API route or upload/OAuth code was added", () => {
    expect(existsSync("app/api/videos")).toBe(false);
    for (const f of ["lib/videos.ts", "components/videos/VideoWatch.tsx", "app/videos/page.tsx"]) expect(read(f)).not.toMatch(/googleapis|oauth|redis|fetch\(/i);
  });
});
