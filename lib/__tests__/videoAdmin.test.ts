// VIDEO-ADMIN-v1: the REAL admin routes, store, public loader, sitemap and video page; only Clerk and Upstash are fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  userId: "owner-1" as string | null,
  hashes: {} as Record<string, Record<string, unknown>>,
  kv: {} as Record<string, unknown>,
  lists: {} as Record<string, unknown[]>,
  failHgetall: false,
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: h.userId }) }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async hgetall(k: string) { if (h.failHgetall) throw new Error("redis down"); const v = h.hashes[k]; return v && Object.keys(v).length ? structuredClone(v) : null; }
    async hget(k: string, f: string) { return structuredClone(h.hashes[k]?.[f] ?? null); }
    async hset(k: string, o: Record<string, unknown>) { h.hashes[k] = { ...(h.hashes[k] ?? {}), ...structuredClone(o) }; return Object.keys(o).length; }
    async hsetnx(k: string, f: string, v: unknown) { if (h.hashes[k] && f in h.hashes[k]) return 0; (h.hashes[k] ??= {})[f] = structuredClone(v); return 1; }
    async hdel(k: string, f: string) { if (h.hashes[k] && f in h.hashes[k]) { delete h.hashes[k][f]; return 1; } return 0; }
    async get(k: string) { return structuredClone(h.kv[k] ?? null); }
    async set(k: string, v: unknown) { h.kv[k] = v; return "OK"; }
    async lpush(k: string, v: unknown) { (h.lists[k] ??= []).unshift(structuredClone(v)); return 1; }
    async ltrim() { return "OK"; }
  },
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import { GET as listGET, POST as createPOST } from "@/app/api/admin/videos/route";
import { PATCH as videoPATCH, DELETE as videoDELETE } from "@/app/api/admin/videos/[id]/route";
import { POST as reorderPOST } from "@/app/api/admin/videos/reorder/route";
import sitemap from "@/app/sitemap";
import VideoPage, { generateMetadata } from "@/app/videos/[id]/page";
import { loadPublished, VIDEOS_KEY, VIDEOS_SEEDED_KEY } from "@/lib/videoStore";

const A = "aaaaaaaaaaa", B = "bbbbbbbbbbb", C = "ccccccccccc", SEED = "49OpWJEADlI";
const HOST = "https://www.atlastrading.app";
const jreq = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${HOST}${url}`, { method, headers: { "content-type": "application/json", host: "www.atlastrading.app", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const form = (over: Record<string, unknown> = {}) => ({ url: `https://youtu.be/${A}`, titleEn: "Hello", descriptionEn: "Desc", category: "tutorials", date: "2026-11-18", status: "published", ...over });
const add = (over: Record<string, unknown> = {}) => createPOST(jreq("POST", "/api/admin/videos", form(over)));
const list = async () => ((await (await listGET()).json()) as { videos: { id: string; status: string; title: { en: string; ar?: string; fr?: string }; position: number }[] }).videos;
const pubIds = async () => (await loadPublished()).map((v) => v.id);

beforeEach(() => {
  h.userId = "owner-1"; h.hashes = {}; h.kv = {}; h.lists = {}; h.failHgetall = false;
  process.env.OWNER_CLERK_USER_ID = "owner-1";
  process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "t";
});

describe("admin authorization (server side)", () => {
  const all = () => [
    () => listGET(),
    () => add(),
    () => videoPATCH(jreq("PATCH", `/api/admin/videos/${A}`, { status: "draft" }), ctx(A)),
    () => videoDELETE(jreq("DELETE", `/api/admin/videos/${A}`, { confirm: true }), ctx(A)),
    () => reorderPOST(jreq("POST", "/api/admin/videos/reorder", { id: A, direction: "up" })),
  ];
  it("signed-out visitors get 404 on every route and change nothing", async () => {
    h.userId = null;
    for (const call of all()) expect((await call()).status).toBe(404);
    expect(h.hashes[VIDEOS_KEY]).toBeUndefined();
  });
  it("a signed-in non-owner gets 404 on every route", async () => {
    h.userId = "member-9";
    for (const call of all()) expect((await call()).status).toBe(404);
  });
  it("fails closed when OWNER_CLERK_USER_ID is unset", async () => {
    delete process.env.OWNER_CLERK_USER_ID;
    for (const call of all()) expect((await call()).status).toBe(404);
  });
  it("a write from another website's origin is refused even for the owner", async () => {
    const res = await createPOST(jreq("POST", "/api/admin/videos", form(), { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(await pubIds()).not.toContain(A);
  });
  it("the admin page layout still guards everything under /admin, including /admin/videos", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    expect(readFileSync("app/admin/layout.tsx", "utf8")).toContain("if (!isOwnerId(userId)) notFound();");
    expect(existsSync("app/admin/videos/page.tsx")).toBe(true);
    expect(existsSync("app/admin/videos/layout.tsx")).toBe(false); // inherits the guard, never bypasses it
  });
});

describe("migration from lib/videos.ts", () => {
  it("copies the existing video once, published, without duplicates", async () => {
    const first = await list();
    expect(first.map((v) => v.id)).toEqual([SEED]);
    expect(first[0]).toMatchObject({ status: "published", title: { en: expect.stringContaining("Cryptocurrency"), ar: expect.any(String), fr: expect.any(String) } });
    await list(); await list(); await pubIds();
    expect(Object.keys(h.hashes[VIDEOS_KEY])).toEqual([SEED]);
    expect(h.kv[VIDEOS_SEEDED_KEY]).toBe("1");
  });
  it("a migrated video the owner deletes does not come back", async () => {
    await list();
    expect((await videoDELETE(jreq("DELETE", `/api/admin/videos/${SEED}`, { confirm: true }), ctx(SEED))).status).toBe(200);
    expect(await list()).toEqual([]);
    expect(await pubIds()).toEqual([]);
  });
  it("manual edits survive a re-seed attempt (HSETNX never overwrites)", async () => {
    await list();
    await videoPATCH(jreq("PATCH", `/api/admin/videos/${SEED}`, { titleEn: "Renamed" }), ctx(SEED));
    delete h.kv[VIDEOS_SEEDED_KEY]; // pretend the marker was lost
    h.hashes[VIDEOS_KEY] = { ...h.hashes[VIDEOS_KEY] };
    expect((await list())[0].title.en).toBe("Renamed");
  });
});

describe("add video", () => {
  it("saves a valid video (all three languages), first in order, with the ID taken from the link", async () => {
    await list();
    const res = await add({ url: `https://www.youtube.com/watch?v=${A}&t=5`, titleAr: "عنوان", titleFr: "Titre", descriptionAr: "وصف", descriptionFr: "Desc FR" });
    expect(res.status).toBe(201);
    const v = ((await res.json()) as { video: { id: string; title: object; description: object; status: string } }).video;
    expect(v).toMatchObject({ id: A, title: { en: "Hello", ar: "عنوان", fr: "Titre" }, description: { en: "Desc", ar: "وصف", fr: "Desc FR" }, status: "published" });
    expect((await list()).map((x) => x.id)).toEqual([A, SEED]);
  });
  it("accepts watch, youtu.be, Shorts and embed links", async () => {
    for (const [id, url] of [[A, `https://www.youtube.com/watch?v=${A}`], [B, `https://youtu.be/${B}`], [C, `https://www.youtube.com/shorts/${C}`], ["ddddddddddd", "https://www.youtube.com/embed/ddddddddddd"]] as const) {
      expect((await add({ url })).status, url).toBe(201);
      expect((await list()).some((v) => v.id === id)).toBe(true);
    }
  });
  it("rejects invalid YouTube links and saves nothing", async () => {
    for (const url of ["", "hello", "https://example.com/watch?v=" + A, "https://www.youtube.com/watch?v=short", "https://www.youtube.com/", "javascript:alert(1)", 42, null, "x".repeat(400)]) {
      const res = await add({ url });
      expect(res.status, String(url)).toBe(400);
      expect(((await res.json()) as { error: string }).error.length).toBeGreaterThan(5);
    }
    expect((await list()).map((v) => v.id)).toEqual([SEED]); // only the migrated one
  });
  it("rejects duplicates, even through a different link shape", async () => {
    expect((await add()).status).toBe(201);
    for (const url of [`https://youtu.be/${A}`, `https://www.youtube.com/shorts/${A}`, A]) {
      const res = await add({ url });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toMatch(/already in the library/);
    }
    expect((await list()).filter((v) => v.id === A)).toHaveLength(1);
  });
  it("the migrated video counts as a duplicate too", async () => {
    expect((await add({ url: `https://youtu.be/${SEED}` })).status).toBe(409);
  });
  it("validates every field on the server", async () => {
    for (const bad of [{ titleEn: "" }, { titleEn: "   " }, { titleEn: "x".repeat(121) }, { titleAr: "y".repeat(121) }, { descriptionEn: "z".repeat(801) }, { titleEn: 5 }, { category: "bogus" }, { date: "2026-02-31" }, { date: "18/11/2026" }, { status: "live" }, { status: undefined }])
      expect((await add(bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await add({ category: "", date: "", descriptionEn: "" })).status).toBe(201); // category, date and description are optional
  });
  it("trims text and strips control characters", async () => {
    await add({ titleEn: "  Clean\u0000 title\u0007  " });
    expect((await list()).find((v) => v.id === A)?.title.en).toBe("Clean title");
  });
  it("rejects a body that is not a JSON object", async () => {
    const res = await createPOST(new Request(`${HOST}/api/admin/videos`, { method: "POST", headers: { host: "www.atlastrading.app" }, body: "[1,2]" }));
    expect(res.status).toBe(400);
  });
  it("writes an audit entry", async () => {
    await add();
    expect(JSON.stringify(h.lists["atlas:admin-audit"])).toContain("video.create");
  });
});

describe("edit, publish / unpublish, delete", () => {
  beforeEach(async () => { await add(); await add({ url: `https://youtu.be/${B}`, titleEn: "Second" }); });
  it("edits text, category and date but never the YouTube ID", async () => {
    const res = await videoPATCH(jreq("PATCH", `/api/admin/videos/${A}`, { titleEn: "New", titleFr: "Nouveau", category: "analysis", date: "2026-12-01", url: "https://youtu.be/zzzzzzzzzzz", id: "zzzzzzzzzzz" }), ctx(A));
    expect(res.status).toBe(200);
    const v = (await list()).find((x) => x.id === A)!;
    expect(v).toMatchObject({ title: { en: "New", fr: "Nouveau" }, category: "analysis", date: "2026-12-01" });
    expect((await list()).some((x) => x.id === "zzzzzzzzzzz")).toBe(false);
  });
  it("clears an optional language by sending it empty", async () => {
    await videoPATCH(jreq("PATCH", `/api/admin/videos/${A}`, { titleAr: "عنوان" }), ctx(A));
    await videoPATCH(jreq("PATCH", `/api/admin/videos/${A}`, { titleAr: "" }), ctx(A));
    expect((await list()).find((x) => x.id === A)!.title.ar).toBeUndefined();
  });
  it("rejects bad edits, unknown and malformed ids, and empty patches", async () => {
    expect((await videoPATCH(jreq("PATCH", `/api/admin/videos/${A}`, { titleEn: "" }), ctx(A))).status).toBe(400);
    expect((await videoPATCH(jreq("PATCH", `/api/admin/videos/${A}`, { status: "x" }), ctx(A))).status).toBe(400);
    expect((await videoPATCH(jreq("PATCH", `/api/admin/videos/${A}`, {}), ctx(A))).status).toBe(400);
    expect((await videoPATCH(jreq("PATCH", `/api/admin/videos/${C}`, { titleEn: "x" }), ctx(C))).status).toBe(404);
    expect((await videoPATCH(jreq("PATCH", "/api/admin/videos/bad", { titleEn: "x" }), ctx("bad"))).status).toBe(400);
  });
  it("unpublish hides the video everywhere public; publish brings it back", async () => {
    expect(await pubIds()).toContain(A);
    expect((await videoPATCH(jreq("PATCH", `/api/admin/videos/${A}`, { status: "draft" }), ctx(A))).status).toBe(200);
    expect(await pubIds()).not.toContain(A);
    expect((await sitemap()).map((e) => e.url)).not.toContain(`${HOST}/videos/${A}`);
    await expect(VideoPage({ params: Promise.resolve({ id: A }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await generateMetadata({ params: Promise.resolve({ id: A }) })).title).toBe("Video — Atlas Trading"); // no draft details leak
    expect(JSON.stringify(h.lists["atlas:admin-audit"])).toContain("video.unpublish");
    await videoPATCH(jreq("PATCH", `/api/admin/videos/${A}`, { status: "published" }), ctx(A));
    expect(await pubIds()).toContain(A);
    expect((await sitemap()).map((e) => e.url)).toContain(`${HOST}/videos/${A}`);
    await expect(VideoPage({ params: Promise.resolve({ id: A }) })).resolves.toBeTruthy();
  });
  it("delete needs the confirmation flag, removes the video, and a second delete is a 404", async () => {
    expect((await videoDELETE(jreq("DELETE", `/api/admin/videos/${A}`), ctx(A))).status).toBe(400);
    expect((await videoDELETE(jreq("DELETE", `/api/admin/videos/${A}`, { confirm: false }), ctx(A))).status).toBe(400);
    expect(await pubIds()).toContain(A);
    expect((await videoDELETE(jreq("DELETE", `/api/admin/videos/${A}`, { confirm: true }), ctx(A))).status).toBe(200);
    expect(await pubIds()).not.toContain(A);
    expect((await videoDELETE(jreq("DELETE", `/api/admin/videos/${A}`, { confirm: true }), ctx(A))).status).toBe(404);
    expect((await videoDELETE(jreq("DELETE", "/api/admin/videos/bad", { confirm: true }), ctx("bad"))).status).toBe(400);
    expect((await list()).some((v) => v.id === B)).toBe(true); // others untouched
  });
});

describe("order", () => {
  beforeEach(async () => { await add({ url: `https://youtu.be/${A}` }); await add({ url: `https://youtu.be/${B}` }); await add({ url: `https://youtu.be/${C}` }); });
  const order = async () => (await list()).map((v) => v.id);
  const move = (id: string, direction: unknown) => reorderPOST(jreq("POST", "/api/admin/videos/reorder", { id, direction }));
  it("new videos go first; up/down swap neighbours; the public order follows", async () => {
    expect(await order()).toEqual([C, B, A, SEED]);
    expect((await move(A, "up")).status).toBe(200);
    expect(await order()).toEqual([C, A, B, SEED]);
    expect((await move(C, "down")).status).toBe(200);
    expect(await order()).toEqual([A, C, B, SEED]);
    expect(await pubIds()).toEqual([A, C, B, SEED]);
  });
  it("moving past either end changes nothing; bad requests are refused", async () => {
    await move(C, "up"); await move(SEED, "down");
    expect(await order()).toEqual([C, B, A, SEED]);
    expect((await move(A, "sideways")).status).toBe(400);
    expect((await move("bad", "up")).status).toBe(400);
    expect((await move("zzzzzzzzzzz", "up")).status).toBe(404);
  });
});

describe("public visibility and persistence", () => {
  it("drafts never reach the public loader, and public records carry no admin-only fields", async () => {
    await add({ status: "draft" });
    await add({ url: `https://youtu.be/${B}` });
    const pub = await loadPublished();
    expect(pub.map((v) => v.id)).toEqual([B, SEED]);
    for (const v of pub) expect(Object.keys(v).sort()).toEqual(["category", "date", "description", "id", "title"]);
    expect((await sitemap()).map((e) => e.url).filter((u) => u.includes("/videos/"))).toEqual([`${HOST}/videos/${B}`, `${HOST}/videos/${SEED}`]);
  });
  it("a corrupted or draft-like record is never shown", async () => {
    await list();
    h.hashes[VIDEOS_KEY][A] = { id: A, title: { en: "No status field" } };
    h.hashes[VIDEOS_KEY][B] = "not json{";
    h.hashes[VIDEOS_KEY]["bad id"] = { id: "bad id", title: { en: "x" }, status: "published" };
    expect(await pubIds()).toEqual([SEED]);
  });
  it("if Redis fails or is missing, the public site shows nothing rather than risking a draft", async () => {
    await add({ status: "draft" });
    h.failHgetall = true;
    expect(await loadPublished()).toEqual([]);
    h.failHgetall = false;
    delete process.env.UPSTASH_REDIS_REST_URL;
    expect(await loadPublished()).toEqual([]);
    expect((await sitemap()).some((e) => e.url.includes("/videos/"))).toBe(false);
  });
  it("persists across 'deployments': a fresh code load still sees the stored videos, and nothing resets them", async () => {
    await add({ url: `https://youtu.be/${B}`, titleEn: "Kept" });
    vi.resetModules();
    const fresh = await import("@/app/api/admin/videos/route");
    const videos = ((await (await fresh.GET()).json()) as { videos: { id: string }[] }).videos;
    expect(videos.map((v) => v.id).sort()).toEqual([B, SEED].sort());
    const store = await import("@/lib/videoStore");
    expect((await store.loadPublished()).map((v) => v.id)).toContain(B);
  });
  it("keeps Arabic, French and English text separate and falls back to English", async () => {
    await add({ titleAr: "عربي", titleFr: "Français", descriptionAr: "", descriptionFr: "" });
    const v = (await loadPublished()).find((x) => x.id === A)!;
    expect(v.title).toEqual({ en: "Hello", ar: "عربي", fr: "Français" });
    expect(v.description).toEqual({ en: "Desc" });
    const { pick } = await import("@/lib/videos");
    expect([pick(v.title, "ar"), pick(v.title, "fr"), pick(v.description, "ar")]).toEqual(["عربي", "Français", "Desc"]);
  });
});
