// VIDEO-ALERTS-v1: real admin + member routes, store and push sender; only Clerk, Upstash and web-push are fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  userId: "owner-1" as string | null,
  hashes: {} as Record<string, Record<string, unknown>>,
  kv: {} as Record<string, unknown>,
  sets: {} as Record<string, Set<string>>,
  lists: {} as Record<string, unknown[]>,
  sent: [] as { endpoint: string; body: Record<string, unknown>; ttl?: number }[],
  failWith: {} as Record<string, number>, // endpoint -> HTTP status to fail with
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: h.userId }) }));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (sub: { endpoint: string }, payload: string, opts?: { TTL?: number }) => {
      const status = h.failWith[sub.endpoint];
      if (status) throw Object.assign(new Error("push failed"), { statusCode: status });
      h.sent.push({ endpoint: sub.endpoint, body: JSON.parse(payload), ttl: opts?.TTL });
    },
  },
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async hgetall(k: string) { const v = h.hashes[k]; return v && Object.keys(v).length ? structuredClone(v) : null; }
    async hget(k: string, f: string) { return structuredClone(h.hashes[k]?.[f] ?? null); }
    async hset(k: string, o: Record<string, unknown>) { h.hashes[k] = { ...(h.hashes[k] ?? {}), ...structuredClone(o) }; return Object.keys(o).length; }
    async hsetnx(k: string, f: string, v: unknown) { if (h.hashes[k] && f in h.hashes[k]) return 0; (h.hashes[k] ??= {})[f] = structuredClone(v); return 1; }
    async hdel(k: string, f: string) { if (h.hashes[k] && f in h.hashes[k]) { delete h.hashes[k][f]; return 1; } return 0; }
    async hexists(k: string, f: string) { return h.hashes[k] && f in h.hashes[k] ? 1 : 0; }
    async hlen(k: string) { return Object.keys(h.hashes[k] ?? {}).length; }
    async get(k: string) { return structuredClone(h.kv[k] ?? null); }
    async set(k: string, v: unknown, o?: { nx?: boolean }) { if (o?.nx && k in h.kv) return null; h.kv[k] = v; return "OK"; }
    async del(k: string) { const had = k in h.kv; delete h.kv[k]; return had ? 1 : 0; }
    async expire() { return 1; }
    async sadd(k: string, ...m: string[]) { const s = (h.sets[k] ??= new Set()); m.forEach((x) => s.add(x)); return m.length; }
    async srem(k: string, m: string) { h.sets[k]?.delete(m); return 1; }
    async smembers(k: string) { return [...(h.sets[k] ?? [])]; }
    async lpush(k: string, v: unknown) { (h.lists[k] ??= []).unshift(structuredClone(v)); return 1; }
    async ltrim() { return "OK"; }
  },
}));

import { GET as listGET, POST as createPOST } from "@/app/api/admin/video-alerts/route";
import { PATCH as alertPATCH, DELETE as alertDELETE } from "@/app/api/admin/video-alerts/[id]/route";
import { GET as feedGET, POST as feedPOST } from "@/app/api/me/video-alerts/route";
import { ALERTS_KEY, alertClaimKey, alertPayload, notifyVideoAlert, publishedAlerts, type AlertRedis, type VideoAlert } from "@/lib/videoAlerts";
import { Redis } from "@upstash/redis";

const A = "aaaaaaaaaaa", B = "bbbbbbbbbbb";
const HOST = "https://www.atlastrading.app";
const jreq = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${HOST}${url}`, { method, headers: { "content-type": "application/json", host: "www.atlastrading.app", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const input = (over: Record<string, unknown> = {}) => ({ url: `https://youtu.be/${A}`, title: "Technical Analysis with ATLAS TRADING", description: "Discover how to analyze crypto charts and build structured trade plans.", ...over });
const publish = (over: Record<string, unknown> = {}) => createPOST(jreq("POST", "/api/admin/video-alerts", input(over)));
const json = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T;
const feed = async () => json<{ alerts: { id: string; read: boolean; title: string; thumbnail: string; url: string }[]; unread: number }>(await feedGET());
const stored = () => h.hashes[ALERTS_KEY] as Record<string, VideoAlert> | undefined;

/** A member with push on: prefs.enabled, N devices registered. */
function member(id: string, devices = 1, enabled = true) {
  h.sets["push:users"] = (h.sets["push:users"] ?? new Set()).add(id);
  h.kv[`user:${id}:prefs`] = { enabled };
  h.hashes[`user:${id}:push`] = Object.fromEntries(Array.from({ length: devices }, (_, i) => [`d${i}`, { endpoint: `https://fcm.googleapis.com/${id}-${i}`, keys: { p256dh: "k", auth: "a" }, lang: "en", createdAt: 1 }]));
}

beforeEach(() => {
  h.userId = "owner-1"; h.hashes = {}; h.kv = {}; h.sets = {}; h.lists = {}; h.sent = []; h.failWith = {};
  process.env.OWNER_CLERK_USER_ID = "owner-1";
  process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "t";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub"; process.env.VAPID_PRIVATE_KEY = "priv"; process.env.VAPID_SUBJECT = "mailto:a@b.c";
});

describe("admin authorization", () => {
  const calls = () => [
    () => listGET(),
    () => publish(),
    () => alertPATCH(jreq("PATCH", `/api/admin/video-alerts/${A}`, { status: "unpublished" }), ctx(A)),
    () => alertDELETE(jreq("DELETE", `/api/admin/video-alerts/${A}`, { confirm: true }), ctx(A)),
  ];
  it("signed-out visitors and regular members get 404 on every admin method; nothing is stored or sent", async () => {
    member("m1");
    for (const who of [null, "member-9"]) {
      h.userId = who;
      for (const c of calls()) expect((await c()).status).toBe(404);
    }
    expect(stored()).toBeUndefined();
    expect(h.sent).toEqual([]);
  });
  it("fails closed when OWNER_CLERK_USER_ID is unset", async () => {
    delete process.env.OWNER_CLERK_USER_ID;
    for (const c of calls()) expect((await c()).status).toBe(404);
  });
  it("a write from another site's origin is refused, even for the owner", async () => {
    const r = await createPOST(jreq("POST", "/api/admin/video-alerts", input(), { origin: "https://evil.example" }));
    expect(r.status).toBe(403);
    expect(stored()).toBeUndefined();
  });
  it("the admin pages stay behind the owner guard and the new tab exists", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("app/admin/layout.tsx", "utf8")).toContain("if (!isOwnerId(userId)) notFound();");
    expect(readFileSync("components/admin/AdminDashboard.tsx", "utf8")).toContain('{ id: "alerts", label: "Video Alerts" }');
    expect(readFileSync("app/admin/page.tsx", "utf8")).toContain('tab === "alerts"');
  });
});

describe("validation", () => {
  it("rejects bad links, missing/over-long text and unsafe thumbnails; nothing is saved or sent", async () => {
    member("m1");
    const bad: Record<string, unknown>[] = [
      { url: "" }, { url: "hello" }, { url: "https://example.com/watch?v=" + A }, { url: "javascript:alert(1)" }, { url: 5 },
      { title: "" }, { title: "   " }, { title: "x".repeat(121) }, { title: 7 }, { description: "y".repeat(401) }, { description: 3 },
      { thumbnail: "http://insecure.example/a.png" }, { thumbnail: "javascript:alert(1)" }, { thumbnail: "not a url" }, { thumbnail: 5 }, { thumbnail: "https://u:p@x.example/a.png" },
      { notify: "yes" },
    ];
    for (const b of bad) {
      const r = await publish(b);
      expect(r.status, JSON.stringify(b)).toBe(400);
      expect((await json<{ error: string }>(r)).error.length).toBeGreaterThan(5);
    }
    expect(stored()).toBeUndefined();
    expect(h.sent).toEqual([]);
  });
  it("accepts watch, youtu.be, Shorts and embed links and strips control characters", async () => {
    for (const u of [`https://www.youtube.com/watch?v=${A}&t=3`, `https://youtu.be/${B}`, "https://www.youtube.com/shorts/ccccccccccc", "https://www.youtube.com/embed/ddddddddddd"]) {
      expect((await publish({ url: u, notify: false })).status, u).toBe(201);
    }
    expect(Object.keys(stored()!).sort()).toEqual([A, B, "ccccccccccc", "ddddddddddd"].sort());
    await publish({ url: "https://youtu.be/eeeeeeeeeee", title: "  Clean\u0000 title\u0007 ", notify: false });
    expect(stored()!["eeeeeeeeeee"].title).toBe("Clean title");
  });
  it("a description is optional and a custom https thumbnail is kept", async () => {
    expect((await publish({ description: "", thumbnail: "https://cdn.example.com/t.png", notify: false })).status).toBe(201);
    expect(stored()![A]).toMatchObject({ description: "", thumbnail: "https://cdn.example.com/t.png" });
  });
  it("refuses a second announcement for the same video, whatever the link shape", async () => {
    expect((await publish({ notify: false })).status).toBe(201);
    for (const url of [`https://youtu.be/${A}`, `https://www.youtube.com/shorts/${A}`, `https://www.youtube.com/watch?v=${A}`]) expect((await publish({ url, notify: false })).status).toBe(409);
    expect(Object.keys(stored()!)).toEqual([A]);
  });
});

describe("push notification on publish", () => {
  it("goes to every member with notifications on, only once per device, with the required content", async () => {
    member("m1", 2); member("m2", 1);
    const r = await publish();
    expect(r.status).toBe(201);
    const d = await json<{ alert: VideoAlert; message: string }>(r);
    expect(d.alert.push).toMatchObject({ state: "sent", users: 2, devices: 3 });
    expect(d.message).toBe("Notification sent to 2 members (3 devices).");
    expect(h.sent).toHaveLength(3);
    for (const s of h.sent) {
      expect(s.body).toMatchObject({
        title: "ATLAS TRADING — New Video Available",
        body: "Technical Analysis with ATLAS TRADING. Discover how to analyze crypto charts and build structured trade plans.",
        url: `https://www.youtube.com/watch?v=${A}`, tag: `video-${A}`, actions: [{ action: "watch", title: "Watch Now" }],
      });
      expect(s.ttl).toBe(86400);
    }
  });
  it("skips members who switched notifications off and members with no subscription", async () => {
    member("on"); member("off", 1, false);
    h.sets["push:users"].add("nosub"); h.kv["user:nosub:prefs"] = { enabled: true };
    h.sets["push:users"].add("ghost"); // no prefs at all
    const d = await json<{ alert: VideoAlert }>(await publish());
    expect(d.alert.push).toMatchObject({ state: "sent", users: 1, devices: 1 });
    expect(h.sent.map((s) => s.endpoint)).toEqual(["https://fcm.googleapis.com/on-0"]);
  });
  it("sends nothing when notify is off, and the admin can send it later, exactly once", async () => {
    member("m1");
    const d = await json<{ alert: VideoAlert }>(await publish({ notify: false }));
    expect(d.alert.push).toBeNull();
    expect(h.sent).toEqual([]);
    const r = await alertPATCH(jreq("PATCH", `/api/admin/video-alerts/${A}`, { notify: true }), ctx(A));
    expect(r.status).toBe(200);
    expect(h.sent).toHaveLength(1);
    expect(stored()![A].push?.state).toBe("sent");
    const again = await alertPATCH(jreq("PATCH", `/api/admin/video-alerts/${A}`, { notify: true }), ctx(A));
    expect(again.status).toBe(409);
    expect(h.sent).toHaveLength(1);
  });
  it("never sends a second notification for the same video, even if called twice at once", async () => {
    member("m1");
    await publish({ notify: false });
    const alert = stored()![A];
    const r = new Redis({ url: "x", token: "y" }) as unknown as AlertRedis;
    const [x, y] = await Promise.all([notifyVideoAlert(r, alert), notifyVideoAlert(r, alert)]);
    expect([x.state, y.state].sort()).toEqual(["duplicate", "sent"]);
    expect(h.sent).toHaveLength(1);
    expect((await notifyVideoAlert(r, alert)).state).toBe("duplicate");
    expect(h.sent).toHaveLength(1);
  });
  it("deleting and re-adding the same video does not re-notify within the guard period", async () => {
    member("m1");
    await publish();
    await alertDELETE(jreq("DELETE", `/api/admin/video-alerts/${A}`, { confirm: true }), ctx(A));
    const d = await json<{ alert: VideoAlert; message: string }>(await publish());
    expect(d.alert.push?.state).toBe("duplicate");
    expect(d.message).toMatch(/already sent/);
    expect(h.sent).toHaveLength(1);
  });
  it("removes expired subscriptions (404/410), keeps the ones that merely failed, and still reaches the rest", async () => {
    member("m1", 3); member("m2", 1);
    h.failWith["https://fcm.googleapis.com/m1-0"] = 410;
    h.failWith["https://fcm.googleapis.com/m1-1"] = 404;
    h.failWith["https://fcm.googleapis.com/m1-2"] = 500;
    const d = await json<{ alert: VideoAlert }>(await publish());
    expect(d.alert.push).toMatchObject({ state: "sent", users: 1, devices: 1 });
    expect(Object.keys(h.hashes["user:m1:push"])).toEqual(["d2"]); // d0 and d1 were expired and removed; d2 had a temporary error
    expect(h.sent.map((s) => s.endpoint)).toEqual(["https://fcm.googleapis.com/m2-0"]);
  });
  it("reports failure clearly and lets the admin retry when nobody could be reached", async () => {
    member("m1");
    h.failWith["https://fcm.googleapis.com/m1-0"] = 500;
    const d = await json<{ alert: VideoAlert; message: string }>(await publish());
    expect(d.alert.status).toBe("published"); // the announcement itself is not lost
    expect(d.alert.push?.state).toBe("nobody");
    expect(d.message).toMatch(/nothing was sent/);
    expect(h.kv[alertClaimKey(A)]).toBeUndefined(); // claim released
    delete h.failWith["https://fcm.googleapis.com/m1-0"];
    const retry = await alertPATCH(jreq("PATCH", `/api/admin/video-alerts/${A}`, { notify: true }), ctx(A));
    expect((await json<{ alert: VideoAlert }>(retry)).alert.push?.state).toBe("sent");
    expect(h.sent).toHaveLength(1);
  });
  it("says so when nobody has notifications on, and when push is not configured, without losing the announcement", async () => {
    let d = await json<{ alert: VideoAlert; message: string }>(await publish());
    expect(d.alert.push?.state).toBe("nobody");
    delete process.env.VAPID_PRIVATE_KEY;
    member("m1");
    d = await json(await publish({ url: `https://youtu.be/${B}` }));
    expect(d.alert.push?.state).toBe("not-configured");
    expect(d.message).toMatch(/not configured/);
    expect(h.sent).toEqual([]);
    expect(Object.keys(stored()!).sort()).toEqual([A, B]);
  });
  it("a long description is shortened in the notification, and the title never doubles its full stop", () => {
    expect(alertPayload({ id: A, title: "Intro.", description: "x".repeat(300) }).body.length).toBeLessThanOrEqual(160);
    expect(alertPayload({ id: A, title: "Intro.", description: "More" }).body).toBe("Intro. More");
    expect(alertPayload({ id: A, title: "Only a title", description: "" }).body).toBe("Only a title");
  });
});

describe("unpublish, republish, delete", () => {
  it("unpublish hides it from members, republish brings it back without a new push, notify needs a published alert", async () => {
    member("m1");
    await publish();
    h.userId = "m1";
    expect((await feed()).alerts.map((a) => a.id)).toEqual([A]);
    h.userId = "owner-1";
    expect((await alertPATCH(jreq("PATCH", `/api/admin/video-alerts/${A}`, { status: "unpublished" }), ctx(A))).status).toBe(200);
    h.userId = "m1";
    expect((await feed()).alerts).toEqual([]);
    h.userId = "owner-1";
    expect((await alertPATCH(jreq("PATCH", `/api/admin/video-alerts/${A}`, { notify: true }), ctx(A))).status).toBe(400); // hidden announcements are never notified
    await alertPATCH(jreq("PATCH", `/api/admin/video-alerts/${A}`, { status: "published" }), ctx(A));
    expect(h.sent).toHaveLength(1);
    h.userId = "m1";
    expect((await feed()).alerts.map((a) => a.id)).toEqual([A]);
  });
  it("cannot notify an unpublished announcement that was never sent", async () => {
    await publish({ notify: false });
    await alertPATCH(jreq("PATCH", `/api/admin/video-alerts/${A}`, { status: "unpublished" }), ctx(A));
    expect((await alertPATCH(jreq("PATCH", `/api/admin/video-alerts/${A}`, { notify: true }), ctx(A))).status).toBe(400);
  });
  it("rejects bad patches and unknown or malformed ids", async () => {
    await publish({ notify: false });
    for (const b of [{}, { status: "x" }, { notify: false }, { notify: "true" }]) expect((await alertPATCH(jreq("PATCH", `/api/admin/video-alerts/${A}`, b), ctx(A))).status, JSON.stringify(b)).toBe(400);
    expect((await alertPATCH(jreq("PATCH", `/api/admin/video-alerts/${B}`, { status: "unpublished" }), ctx(B))).status).toBe(404);
    expect((await alertPATCH(jreq("PATCH", "/api/admin/video-alerts/bad", { status: "unpublished" }), ctx("bad"))).status).toBe(400);
  });
  it("delete needs the confirmation flag, removes it from the feed, and a second delete is a 404", async () => {
    await publish({ notify: false });
    expect((await alertDELETE(jreq("DELETE", `/api/admin/video-alerts/${A}`), ctx(A))).status).toBe(400);
    expect((await alertDELETE(jreq("DELETE", `/api/admin/video-alerts/${A}`, { confirm: false }), ctx(A))).status).toBe(400);
    expect(stored()![A]).toBeTruthy();
    expect((await alertDELETE(jreq("DELETE", `/api/admin/video-alerts/${A}`, { confirm: true }), ctx(A))).status).toBe(200);
    expect(stored()![A]).toBeUndefined();
    expect((await alertDELETE(jreq("DELETE", `/api/admin/video-alerts/${A}`, { confirm: true }), ctx(A))).status).toBe(404);
    expect((await alertDELETE(jreq("DELETE", "/api/admin/video-alerts/bad", { confirm: true }), ctx("bad"))).status).toBe(400);
  });
  it("admin list shows unpublished ones too; every write is audited", async () => {
    member("m1");
    await publish();
    await alertPATCH(jreq("PATCH", `/api/admin/video-alerts/${A}`, { status: "unpublished" }), ctx(A));
    const list = await json<{ alerts: VideoAlert[] }>(await listGET());
    expect(list.alerts.map((a) => [a.id, a.status])).toEqual([[A, "unpublished"]]);
    const audit = JSON.stringify(h.lists["atlas:admin-audit"]);
    for (const k of ["video-alert.publish", "video-alert.notify", "video-alert.unpublish"]) expect(audit).toContain(k);
  });
});

describe("member Video Alerts feed", () => {
  it("requires sign-in", async () => {
    h.userId = null;
    expect((await feedGET()).status).toBe(401);
    expect((await feedPOST(jreq("POST", "/api/me/video-alerts", { all: true }))).status).toBe(401);
  });
  it("shows published announcements newest first with thumbnail, title, link and unread state, even to a member who never had push", async () => {
    await publish({ notify: false });
    await new Promise((r) => setTimeout(r, 5));
    await publish({ url: `https://youtu.be/${B}`, title: "Second", thumbnail: "https://cdn.example.com/t.png", notify: false });
    h.userId = "offline-member"; // no subscription, notifications off
    const f = await feed();
    expect(f.alerts.map((a) => a.id)).toEqual([B, A]);
    expect(f.alerts[0]).toMatchObject({ title: "Second", thumbnail: "https://cdn.example.com/t.png", url: `https://www.youtube.com/watch?v=${B}`, read: false });
    expect(f.alerts[1].thumbnail).toBe(`https://i.ytimg.com/vi/${A}/mqdefault.jpg`);
    expect(f.unread).toBe(2);
    for (const a of f.alerts) expect(Object.keys(a).sort()).toEqual(["description", "id", "publishedAt", "read", "thumbnail", "title", "url"]); // no admin fields
  });
  it("marks one or all as read, per member only", async () => {
    await publish({ notify: false });
    await publish({ url: `https://youtu.be/${B}`, notify: false });
    h.userId = "m1";
    expect((await feedPOST(jreq("POST", "/api/me/video-alerts", { ids: [A] }))).status).toBe(200);
    let f = await feed();
    expect(f.unread).toBe(1);
    expect(f.alerts.find((a) => a.id === A)?.read).toBe(true);
    h.userId = "m2";
    expect((await feed()).unread).toBe(2); // m1's read state does not touch m2
    await feedPOST(jreq("POST", "/api/me/video-alerts", { all: true }));
    expect((await feed()).unread).toBe(0);
    h.userId = "m1";
    f = await feed();
    expect(f.unread).toBe(1);
  });
  it("rejects malformed mark-read requests", async () => {
    h.userId = "m1";
    for (const b of [{}, { ids: "x" }, { ids: ["bad id"] }, { ids: [5] }, { ids: Array(101).fill(A) }]) expect((await feedPOST(jreq("POST", "/api/me/video-alerts", b))).status, JSON.stringify(b)).toBe(400);
    expect(h.sets["user:m1:video-alerts-read"]).toBeUndefined();
  });
  it("corrupt stored records are ignored and the feed is capped at 50", async () => {
    h.hashes[ALERTS_KEY] = { junk: "not json{", [A]: { id: A, title: "no status" } };
    for (let i = 0; i < 55; i++) {
      const id = `v${String(i).padStart(10, "0")}`;
      h.hashes[ALERTS_KEY][id] = { id, title: `T${i}`, description: "", thumbnail: null, status: "published", createdAt: i, publishedAt: i, push: null };
    }
    const r = new Redis({ url: "x", token: "y" }) as unknown as AlertRedis;
    const list = await publishedAlerts(r);
    expect(list).toHaveLength(50);
    expect(list[0].title).toBe("T54");
  });
});

describe("wiring", () => {
  it("the service worker shows the Watch Now action and opens other-site links (YouTube) in a new tab", async () => {
    const { readFileSync } = await import("node:fs");
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain("actions: Array.isArray(data.actions)");
    expect(sw).toContain("self.clients.openWindow(url)");
    expect(sw).toContain("lang: data.lang"); // existing behaviour kept
  });
  it("the member section is on /account and the shared module has no server-only imports", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("app/account/page.tsx", "utf8")).toContain("<VideoAlerts />");
    const shared = readFileSync("lib/videoAlertsShared.ts", "utf8");
    expect(shared.split("\n").filter((l) => l.startsWith("import ")).join("\n")).not.toMatch(/web-push|upstash|userStore|adminAuth/);
    expect(shared).toContain('import type { Payload } from "@/lib/push"');
    expect(readFileSync("components/admin/VideoAlertsPanel.tsx", "utf8")).not.toContain('@/lib/videoAlerts"');
  });
  it("English, French and Arabic have the same keys, no empty strings, matching placeholders", async () => {
    const { videoAlertsEn, videoAlertsFr, videoAlertsAr } = await import("@/lib/i18nVideoAlerts");
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(videoAlertsFr)).toEqual(keys(videoAlertsEn));
    expect(keys(videoAlertsAr)).toEqual(keys(videoAlertsEn));
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of keys(videoAlertsEn)) for (const d of [videoAlertsEn, videoAlertsFr, videoAlertsAr]) { expect(d[k].trim(), k).not.toBe(""); expect(ph(d[k]), k).toBe(ph(videoAlertsEn[k])); }
  });
  it("existing notification categories and the bell are untouched", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("lib/notificationPrefs.ts", "utf8")).not.toMatch(/video/i);
    expect(readFileSync("components/NotificationBell.tsx", "utf8")).toContain('href="/account#notifications"');
  });
});
