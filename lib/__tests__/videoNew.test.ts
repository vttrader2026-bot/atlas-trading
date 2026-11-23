// NEW-VIDEOS-v1: the video library is the one place for videos. Recently published videos get a NEW label and lead the library,
// and the bell shows a count of new videos. Video Alerts (separate announcements + video push) are gone.
import { i18nSource } from "./helpers/i18nSource";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  userId: "owner-1" as string | null,
  lang: "en" as "en" | "ar" | "fr",
  hashes: {} as Record<string, Record<string, unknown>>,
  kv: {} as Record<string, unknown>,
  lists: {} as Record<string, unknown[]>,
  sent: 0,
  failRead: false,
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: h.userId }) }));
vi.mock("web-push", () => ({ default: { setVapidDetails: () => undefined, sendNotification: async () => { h.sent++; } } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, usePathname: () => "/" }));
vi.mock("@/lib/i18n", () => ({
  useLanguage: () => ({ lang: h.lang, t: (k: string) => (k === "nav.notifications" ? "Notifications" : k) }),
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async hgetall(k: string) { if (h.failRead) throw new Error("redis down"); const v = h.hashes[k]; return v && Object.keys(v).length ? structuredClone(v) : null; }
    async hget(k: string, f: string) { return structuredClone(h.hashes[k]?.[f] ?? null); }
    async hset(k: string, o: Record<string, unknown>) { h.hashes[k] = { ...(h.hashes[k] ?? {}), ...structuredClone(o) }; return 1; }
    async hsetnx(k: string, f: string, v: unknown) { if (h.hashes[k] && f in h.hashes[k]) return 0; (h.hashes[k] ??= {})[f] = structuredClone(v); return 1; }
    async hdel(k: string, f: string) { if (h.hashes[k] && f in h.hashes[k]) { delete h.hashes[k][f]; return 1; } return 0; }
    async get(k: string) { return structuredClone(h.kv[k] ?? null); }
    async set(k: string, v: unknown) { h.kv[k] = v; return "OK"; }
    async lpush(k: string, v: unknown) { (h.lists[k] ??= []).unshift(structuredClone(v)); return 1; }
    async ltrim() { return "OK"; }
  },
}));

import { GET as newGET, POST as newPOST, seenKey } from "@/app/api/me/new-videos/route";
import { POST as createPOST } from "@/app/api/admin/videos/route";
import { PATCH as videoPATCH } from "@/app/api/admin/videos/[id]/route";
import VideoLibrary from "@/components/videos/VideoLibrary";
import VideoCard from "@/components/videos/VideoCard";
import { NotificationBellView } from "@/components/NotificationBell";
import { CHROME } from "@/components/videos/chrome";
import { NEW_VIDEO_DAYS, isNewVideo, type Video } from "@/lib/videos";
import { VIDEOS_KEY, VIDEOS_SEEDED_KEY, createVideo, loadPublished, updateVideo, type VideoRedis } from "@/lib/videoStore";
import { Redis } from "@upstash/redis";

const DAY = 86_400_000;
const ID = (c: string) => c.repeat(11);
const HOST = "https://www.atlastrading.app";
const jreq = (method: string, url: string, body?: unknown) =>
  new Request(`${HOST}${url}`, { method, headers: { "content-type": "application/json", host: "www.atlastrading.app" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const redis = () => new Redis({ url: "x", token: "y" }) as unknown as VideoRedis;
const fields = (over: Record<string, unknown> = {}) => ({ title: { en: "T" }, description: { en: "D" }, category: "tutorials" as const, date: null, status: "published" as const, ...over });
const rec = (id: string, over: Record<string, unknown> = {}) => ({ id, title: { en: `Title ${id}` }, description: { en: "" }, category: null, date: null, status: "published", position: 0, createdAt: 1, updatedAt: 1, ...over });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const count = async () => ((await (await newGET()).json()) as { count: number; latestId: string | null });

beforeEach(() => {
  h.userId = "owner-1"; h.lang = "en"; h.hashes = {}; h.kv = { [VIDEOS_SEEDED_KEY]: "1" }; h.lists = {}; h.sent = 0; h.failRead = false;
  process.env.OWNER_CLERK_USER_ID = "owner-1";
  process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
});

describe("the NEW rule", () => {
  const now = 1_800_000_000_000;
  it("is new for 7 days after publishing, then not; unknown or zero publish time is never new", () => {
    expect(NEW_VIDEO_DAYS).toBe(7);
    expect(isNewVideo({ publishedAt: now - 1000 }, now)).toBe(true);
    expect(isNewVideo({ publishedAt: now - 7 * DAY + 1 }, now)).toBe(true);
    expect(isNewVideo({ publishedAt: now - 7 * DAY }, now)).toBe(false);
    expect(isNewVideo({ publishedAt: now - 30 * DAY }, now)).toBe(false);
    expect(isNewVideo({}, now)).toBe(false);
    expect(isNewVideo({ publishedAt: 0 }, now)).toBe(false);
  });
  it("publishing sets the time: created live, draft published later, and unpublish/republish; ordinary edits keep it", async () => {
    const r = redis();
    await createVideo(r, ID("a"), fields(), 1000);
    expect((await loadPublished()).find((v) => v.id === ID("a"))?.publishedAt).toBe(1000);
    await createVideo(r, ID("b"), fields({ status: "draft" }), 2000);
    expect((await loadPublished()).some((v) => v.id === ID("b"))).toBe(false); // a draft is not public
    await updateVideo(r, ID("b"), { status: "published" }, 5000);
    expect((await loadPublished()).find((v) => v.id === ID("b"))?.publishedAt).toBe(5000);
    await updateVideo(r, ID("b"), { title: { en: "Edited" } }, 9000);
    expect((await loadPublished()).find((v) => v.id === ID("b"))?.publishedAt).toBe(5000);
    await updateVideo(r, ID("b"), { status: "draft" }, 9500);
    await updateVideo(r, ID("b"), { status: "published" }, 12_000);
    expect((await loadPublished()).find((v) => v.id === ID("b"))?.publishedAt).toBe(12_000);
  });
  it("older stored videos without a publish time count from their created date; the migrated video keeps its date", async () => {
    h.hashes[VIDEOS_KEY] = { [ID("l")]: rec(ID("l"), { createdAt: 12345 }) };
    expect((await loadPublished())[0].publishedAt).toBe(12345);
    h.hashes = {}; h.kv = {};
    const v = (await loadPublished()).find((x) => x.id === "49OpWJEADlI");
    expect(v?.publishedAt).toBe(Date.parse("2026-11-18T00:00:00Z"));
  });
});

describe("the bell's new-video count (members only, no push)", () => {
  const seed = () => {
    const now = Date.now();
    h.hashes[VIDEOS_KEY] = {
      [ID("p")]: rec(ID("p"), { publishedAt: now - 3_600_000 }),
      [ID("d")]: rec(ID("d"), { status: "draft", publishedAt: now - 60_000 }),
      [ID("o")]: rec(ID("o"), { publishedAt: now - 10 * DAY }),
      [ID("g")]: rec(ID("g"), { createdAt: now - 2 * DAY }), // legacy: no publishedAt
    };
  };
  it("requires sign-in", async () => {
    h.userId = null;
    expect((await newGET()).status).toBe(401);
    expect((await newPOST()).status).toBe(401);
  });
  it("counts only published videos inside the NEW period, never drafts or old ones, and reports the latest", async () => {
    seed(); h.userId = "m1";
    expect(await count()).toEqual({ count: 2, latestId: ID("p") });
  });
  it("opening the library clears it for that member only", async () => {
    seed(); h.userId = "m1";
    expect((await newPOST()).status).toBe(200);
    expect(await count()).toEqual({ count: 0, latestId: null });
    h.userId = "m2";
    expect((await count()).count).toBe(2);
    expect(typeof h.kv[seenKey("m1")]).toBe("number");
  });
  it("publishing in the admin updates it automatically; a draft stays invisible until published; unpublishing removes it", async () => {
    seed(); h.userId = "m1"; await newPOST(); await sleep(5);
    h.userId = "owner-1";
    expect((await createPOST(jreq("POST", "/api/admin/videos", { url: `https://youtu.be/${ID("n")}`, titleEn: "Fresh", category: "updates", date: "2026-11-19", status: "draft" }))).status).toBe(201);
    h.userId = "m1";
    expect((await count()).count).toBe(0); // a draft does not light the bell
    await sleep(5);
    h.userId = "owner-1";
    expect((await videoPATCH(jreq("PATCH", `/api/admin/videos/${ID("n")}`, { status: "published" }), ctx(ID("n")))).status).toBe(200);
    h.userId = "m1";
    expect(await count()).toEqual({ count: 1, latestId: ID("n") });
    h.userId = "owner-1";
    await videoPATCH(jreq("PATCH", `/api/admin/videos/${ID("n")}`, { status: "draft" }), ctx(ID("n")));
    h.userId = "m1";
    expect((await count()).count).toBe(0);
  });
  it("sends no push notification of any kind when a video is published", async () => {
    h.hashes["user:m1:push"] = { d0: { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "k", auth: "a" }, lang: "en", createdAt: 1 } };
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "p"; process.env.VAPID_PRIVATE_KEY = "q"; process.env.VAPID_SUBJECT = "mailto:a@b.c";
    const res = await createPOST(jreq("POST", "/api/admin/videos", { url: `https://youtu.be/${ID("q")}`, titleEn: "Hi", status: "published" }));
    expect(res.status).toBe(201);
    expect(h.sent).toBe(0);
    for (const f of ["app/api/admin/videos/route.ts", "app/api/admin/videos/[id]/route.ts", "app/api/me/new-videos/route.ts", "lib/videoStore.ts", "components/NotificationBell.tsx"])
      expect(readFileSync(f, "utf8"), f).not.toMatch(/web-push|lib\/push|sendToUser|showNotification|pushManager/);
  });
  it("if Redis fails the indicator simply stays off", async () => {
    seed(); h.userId = "m1"; h.failRead = true;
    expect(await count()).toEqual({ count: 0, latestId: null });
  });
});

describe("the bell", () => {
  const bell = (count: number, latestId: string | null = null) => renderToStaticMarkup(createElement(NotificationBellView, { count, latestId }));
  it("with nothing new it still opens Notification Settings and shows no badge", () => {
    const m = bell(0);
    expect(m).toContain('href="/account#notifications"');
    expect(m).not.toContain("data-new-videos");
  });
  it("one new video: badge 1 and a link straight to that video; several: the library; 10+ shows 9+", () => {
    const one = bell(1, "abcdefghijk");
    expect(one).toContain('href="/videos/abcdefghijk"');
    expect(one).toContain('data-new-videos="1"');
    expect(one).toContain(">1</span>");
    expect(one).toContain(`aria-label="${CHROME.bellOne.en}"`);
    const many = bell(3, "abcdefghijk");
    expect(many).toContain('href="/videos"');
    expect(many).toContain("3 new videos");
    expect(bell(12, "abcdefghijk")).toContain(">9+</span>");
  });
  it("is labelled in French and Arabic, with the badge on the start side (RTL-safe)", () => {
    h.lang = "fr"; expect(bell(2)).toContain("2 nouvelles vidéos");
    h.lang = "ar"; expect(bell(2)).toContain("2 فيديوهات جديدة");
    expect(bell(2)).toContain("-end-1.5");
    expect(bell(2)).not.toMatch(/-right-|-left-/);
  });
});

describe("the library", () => {
  const now = Date.now();
  const vid = (c: string, publishedAt?: number, category: Video["category"] = null): Video => ({ id: ID(c), title: { en: `Title ${c}`, ar: `عنوان ${c}`, fr: `Titre ${c}` }, description: { en: "d" }, category, date: null, publishedAt });
  const videos = [vid("o", now - 30 * DAY), vid("b", now - 2 * DAY), vid("a", now - 3_600_000), vid("z")]; // admin order: old, new, newest, no date
  const html = () => renderToStaticMarkup(createElement(VideoLibrary, { videos }));
  it("shows a NEW label on recent videos only, and puts new videos first, newest on top", () => {
    const m = html();
    expect((m.match(/data-new-badge/g) ?? []).length).toBe(2); // the featured one and one card
    const at = (t: string) => m.indexOf(`Title ${t}`);
    expect(at("a")).toBeGreaterThan(-1);
    expect(at("a")).toBeLessThan(at("b"));
    expect(at("b")).toBeLessThan(at("o"));
    expect(at("o")).toBeLessThan(at("z"));
    expect(m).toContain("data-new-videos-section");
    expect(m).toContain(CHROME.newVideos.en);
    expect(m).toContain(CHROME.all.en);
    expect(m).toContain(CHROME.newVideo.en); // the featured block is labelled "New video", not "Latest"
  });
  it("without any new video it looks as before: no badges, no New section, first video featured as Latest", () => {
    const m = renderToStaticMarkup(createElement(VideoLibrary, { videos: [vid("o", now - 30 * DAY), vid("z")] }));
    expect(m).not.toContain("data-new-badge");
    expect(m).not.toContain("data-new-videos-section");
    expect(m).toContain(CHROME.latest.en);
  });
  it("every video link is the same /videos/<id> as before, and an empty library still shows the empty state", () => {
    const m = html();
    for (const c of ["o", "b", "a", "z"]) expect(m).toContain(`href="/videos/${ID(c)}"`);
    expect(renderToStaticMarkup(createElement(VideoLibrary, { videos: [] }))).toContain(CHROME.empty.en);
  });
  it("renders in Arabic and French with localized labels", () => {
    h.lang = "ar"; let m = html();
    expect(m).toContain(CHROME.isNew.ar); expect(m).toContain(CHROME.newVideos.ar); expect(m).toContain("عنوان a");
    h.lang = "fr"; m = html();
    expect(m).toContain(CHROME.isNew.fr); expect(m).toContain(CHROME.newVideos.fr); expect(m).toContain("Titre a");
  });
  it("a card (also used for Related videos) carries the badge only when new, on the start side", () => {
    const card = (v: Video, compact = false) => renderToStaticMarkup(createElement(VideoCard, { video: v, compact }));
    expect(card(vid("a", now - 1000))).toContain("data-new-badge");
    expect(card(vid("a", now - 1000), true)).toContain("data-new-badge");
    expect(card(vid("o", now - 30 * DAY))).not.toContain("data-new-badge");
    expect(card(vid("a", now - 1000))).toContain("start-2");
  });
  it("labels exist in all three languages", () => {
    for (const k of ["isNew", "newVideos", "newVideo", "bellOne", "bellMany"] as const)
      for (const l of ["en", "ar", "fr"] as const) expect(CHROME[k][l].trim(), `${k}.${l}`).not.toBe("");
    expect(CHROME.bellMany.en).toContain("{n}"); expect(CHROME.bellMany.ar).toContain("{n}"); expect(CHROME.bellMany.fr).toContain("{n}");
  });
});

describe("Video Alerts are gone, the rest is intact", () => {
  it("none of its files, routes, tab, section or translations remain", () => {
    for (const f of ["lib/videoAlerts.ts", "lib/videoAlertsShared.ts", "lib/i18nVideoAlerts.ts", "components/admin/VideoAlertsPanel.tsx", "components/account/VideoAlerts.tsx", "app/api/admin/video-alerts", "app/api/me/video-alerts"])
      expect(existsSync(f), f).toBe(false);
    expect(readFileSync("components/admin/AdminDashboard.tsx", "utf8")).not.toMatch(/alerts|Video Alerts/i);
    expect(readFileSync("app/admin/page.tsx", "utf8")).not.toMatch(/alerts/);
    expect(readFileSync("app/account/page.tsx", "utf8")).not.toMatch(/VideoAlerts|video-alerts/);
    expect(i18nSource()).not.toMatch(/videoAlerts/);
    expect(readFileSync("lib/push.ts", "utf8")).not.toMatch(/video/i);
    expect(readFileSync("public/sw.js", "utf8")).not.toMatch(/data\.actions|external/); // the video-only "Watch Now" action and cross-site handling
  });
  it("the general push system and trading notifications are untouched", () => {
    const push = readFileSync("lib/push.ts", "utf8");
    for (const fn of ["notifyTradeSubscribers", "notifySignalEvent", "notifyTpSlSubscribers", "notifyEducational", "notifyRadarAlerts", "sendToUser", "notifyFreeUsersAnalyzerReset", "notifyElitePromo"]) expect(push, fn).toContain(`function ${fn}`);
    const sw = readFileSync("public/sw.js", "utf8");
    for (const k of ['addEventListener("push"', 'addEventListener("notificationclick"', "showNotification", "lang: data.lang"]) expect(sw, k).toContain(k);
    for (const f of ["app/api/me/push/route.ts", "app/api/me/push/test/route.ts", "app/api/me/prefs/route.ts", "lib/notificationPrefs.ts", "lib/pushClient.ts"]) expect(existsSync(f), f).toBe(true);
  });
  it("/admin/videos stays the only video interface, owner-only, and /videos routes are kept", () => {
    expect(readFileSync("app/admin/layout.tsx", "utf8")).toContain("if (!isOwnerId(userId)) notFound();");
    expect(readFileSync("components/admin/AdminDashboard.tsx", "utf8")).toContain('{ id: "videos", label: "Videos" }');
    for (const f of ["app/admin/videos/page.tsx", "app/videos/page.tsx", "app/videos/[id]/page.tsx", "components/videos/VideoPlayer.tsx"]) expect(existsSync(f), f).toBe(true);
    expect(readFileSync("components/videos/VideoPlayer.tsx", "utf8")).toContain("youtube-nocookie");
  });
});
