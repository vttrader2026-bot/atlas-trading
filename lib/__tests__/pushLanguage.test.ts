// Website push notifications are sent in each subscription's saved language (AR with RTL, FR, EN).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Sent = { endpoint: string; payload: { title: string; body: string; url: string; tag?: string; lang?: string; dir?: string } };
const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  users: [] as string[],
  subs: {} as Record<string, Record<string, unknown>>,
  plans: {} as Record<string, string>,
  sent: [] as Sent[],
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, json: string) => { h.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(json) }); },
  },
}));
vi.mock("@/lib/userStore", () => ({
  getRedis: () => ({
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => {
      if (o?.nx && h.kv.has(k)) return null;
      h.kv.set(k, v);
      return "OK";
    },
    get: async (k: string) => (h.kv.has(k) ? h.kv.get(k) : null),
    smembers: async () => h.users,
    hgetall: async (k: string) => h.subs[k.split(":")[1]] ?? null,
    hdel: async () => 1,
  }),
}));
vi.mock("@/lib/plan", async (orig) => ({ ...(await orig<typeof import("@/lib/plan")>()), getUserPlan: async (u: string) => h.plans[u] ?? "free" }));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: async (u: string) => ({ plan: h.plans[u] ?? "free", status: "verified" }) }));

import {
  analyzerResetPayload, educationalPayload, eliteNowPayload, normalizeLang, notifyFreeUsersAnalyzerReset,
  radarDigestPayload, sendToUser, testPayload, tpSlPayload, tradeClosedPayload, tradePayload, type Lang,
} from "@/lib/push";
import { analyzeLimitForPlan } from "@/lib/plan";
import { dictionaries } from "@/lib/i18n";
import { lessons } from "@/lib/academy-content";
import type { PublishedTrade } from "@/lib/tradeFeed";

const LANGS: Lang[] = ["ar", "fr", "en"];
const trade = { id: "t1", createdAt: 1, pair: "BTC/USDT", direction: "Long", timeframe: "4H", entryZone: "1", invalidation: "1", tp1: "1", tp2: "1", tp3: "1", reasoning: "", status: "open" } as PublishedTrade;
const lesson = lessons.find((l) => l.ready)!;
const ARABIC = /[؀-ۿ]/;
const ENGLISH_WORDS = /\b(hit|closed|Daily|Setup Approaching|Market Activity|From Atlas Academy|Unlock|free analyses|Test notification|Your daily)\b/i;

const builders: Array<[string, (l: Lang) => { title: string; body: string }]> = [
  ["test", (l) => testPayload(l)],
  ["radar", (l) => radarDigestPayload(l)],
  ["academy", (l) => educationalPayload(lesson, l)],
  ["elite promo", (l) => eliteNowPayload(l)],
  ["TP", (l) => tpSlPayload(trade, "TP2", l)],
  ["SL", (l) => tpSlPayload(trade, "SL", l)],
  ["trade closed", (l) => tradeClosedPayload(trade, l)],
  ["analyzer reset", (l) => analyzerResetPayload(l)],
];

describe("every notification has real Arabic, French and English text", () => {
  for (const [name, build] of builders) {
    it(name, () => {
      const [ar, fr, en] = LANGS.map((l) => build(l));
      expect(ARABIC.test(ar.title + ar.body)).toBe(true);
      expect(ARABIC.test(fr.title + fr.body)).toBe(false);
      expect(ARABIC.test(en.title + en.body)).toBe(false);
      expect(fr.title + fr.body).not.toBe(en.title + en.body); // French is translated, not the English text
      expect(fr.title + fr.body).not.toBe(ar.title + ar.body);
      expect(`${fr.title} ${fr.body}`).not.toMatch(ENGLISH_WORDS);
      for (const p of [ar, fr, en]) expect(p.title.length * p.body.length).toBeGreaterThan(0);
    });
  }
  it("French uses French wording for the key phrases", () => {
    expect(tpSlPayload(trade, "TP1", "fr").title).toBe("TP1 atteint : BTC/USDT");
    expect(tpSlPayload(trade, "SL", "fr").body).toBe("BTC/USDT clôturé au stop-loss.");
    expect(tradeClosedPayload(trade, "fr").title).toBe("Trade clôturé : BTC/USDT");
    expect(testPayload("fr").body).toBe("Notification de test - tout fonctionne.");
  });
  it("English keeps its existing wording", () => {
    expect(tpSlPayload(trade, "TP1", "en").title).toBe("TP1 hit: BTC/USDT");
    expect(tradeClosedPayload(trade, "en").title).toBe("Trade closed: BTC/USDT");
    expect(radarDigestPayload("en").title).toBe("Atlas Radar — Market Activity Is Building");
  });
  it("Academy and Elite use the same French text as the website", () => {
    expect(educationalPayload(lesson, "fr").body).toBe(lesson.summary.fr);
    expect(educationalPayload(lesson, "fr").title).toContain(lesson.title.fr);
    expect(educationalPayload(lesson, "ar").body).toBe(lesson.summary.ar);
    expect(educationalPayload(lesson, "en").body).toBe(lesson.summary.en);
    const sec = (l: Lang) => (dictionaries[l].eliteSection as unknown as { subtitle: string }).subtitle;
    for (const l of LANGS) expect(eliteNowPayload(l).body).toBe(sec(l));
  });
  it("destinations are the same in every language", () => {
    for (const [, build] of builders) {
      const urls = LANGS.map((l) => (build(l) as unknown as { url: string }).url);
      expect(new Set(urls).size).toBe(1);
    }
  });
  it("the new-signal notification stays one fixed English text", () => {
    const p = tradePayload(trade, "fr", "Bitcoin");
    expect(p.title).toBe("⚡ BUY SIGNAL");
    expect(p.dir).toBe("ltr");
  });
});

describe("Analyzer reset states the real FREE limit", () => {
  it("FREE gets 3 analyses a day, and the message says 3 in every language", () => {
    expect(analyzeLimitForPlan("free")).toBe(3);
    expect(analyzerResetPayload("en").body).toContain("3 free analyses");
    expect(analyzerResetPayload("fr").body).toContain("3 analyses gratuites");
    expect(analyzerResetPayload("ar").body).toContain("3 تحليلات مجانية");
    for (const l of LANGS) {
      const b = analyzerResetPayload(l).body;
      expect(b).not.toMatch(/\btwo\b|\b2\b|deux|تحليلان/);
    }
  });
  it("follows the plan limit instead of a hard-coded number", () => {
    expect(analyzerResetPayload("en", 5).body).toContain("5 free analyses");
    expect(analyzerResetPayload("en", 1).body).toContain("1 free analysis ");
    expect(analyzerResetPayload("ar", 2).body).toContain("تحليلان مجانيان");
  });
  it("keeps its destination and tag", () => {
    expect(analyzerResetPayload("fr")).toMatchObject({ url: "/analyzer", tag: "analyzer-daily-reset" });
  });
});

describe("sendToUser uses each subscription's saved language", () => {
  const sub = (id: string, lang?: unknown) => ({ [id]: { endpoint: `https://fcm.googleapis.com/${id}`, keys: { p256dh: "p", auth: "a" }, ...(lang === undefined ? {} : { lang }), createdAt: 1 } });
  beforeEach(() => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:a@b.c";
    h.kv.clear(); h.sent = []; h.plans = {}; h.users = [];
  });
  it("one user with three devices gets one language per device; Arabic is RTL", async () => {
    h.subs = { u: { ...sub("ar-dev", "ar"), ...sub("fr-dev", "fr"), ...sub("en-dev", "en") } };
    expect(await sendToUser("u", (l) => testPayload(l))).toBe(3);
    const by = (id: string) => h.sent.find((s) => s.endpoint.endsWith(id))!.payload;
    expect(by("ar-dev")).toMatchObject({ lang: "ar", dir: "rtl", body: "إشعار تجريبي — يعمل بنجاح." });
    expect(by("fr-dev")).toMatchObject({ lang: "fr", dir: "ltr", body: "Notification de test - tout fonctionne." });
    expect(by("en-dev")).toMatchObject({ lang: "en", dir: "ltr", body: "Test notification - it works." });
  });
  it("an old or missing saved language falls back to English", async () => {
    h.subs = { u: { ...sub("none"), ...sub("odd", "de") } };
    await sendToUser("u", (l) => testPayload(l));
    for (const s of h.sent) expect(s.payload).toMatchObject({ lang: "en", dir: "ltr", body: "Test notification - it works." });
    expect(normalizeLang("fr")).toBe("fr");
    expect(normalizeLang(undefined)).toBe("en");
  });
  it("the daily Analyzer reset reaches opted-in FREE users in their own language with the right limit; Elite and opted-out are skipped", async () => {
    h.users = ["a", "b", "c", "e", "off"];
    h.subs = { a: sub("a", "ar"), b: sub("b", "fr"), c: sub("c", "en"), e: sub("e", "en"), off: sub("off", "en") };
    for (const u of ["a", "b", "c", "e"]) h.kv.set(`user:${u}:prefs`, { enabled: true, analyzerReset: true });
    h.kv.set("user:off:prefs", { enabled: true, analyzerReset: false });
    h.plans = { e: "elite" };
    const r = await notifyFreeUsersAnalyzerReset();
    expect(r).toEqual({ sent: 3, reason: "ok" });
    const body = (id: string) => h.sent.find((s) => s.endpoint.endsWith(id))!.payload;
    expect(body("/a").body).toContain("3 تحليلات مجانية");
    expect(body("/a").dir).toBe("rtl");
    expect(body("/b").body).toContain("3 analyses gratuites");
    expect(body("/c").body).toContain("3 free analyses");
    expect(h.sent.some((s) => s.endpoint.endsWith("/e") || s.endpoint.endsWith("/off"))).toBe(false);
    expect(await notifyFreeUsersAnalyzerReset()).toEqual({ sent: 0, reason: "already-sent-today" }); // dedupe unchanged
  });
});

describe("wiring", () => {
  it("the subscribe API stores fr (and falls back to en) instead of collapsing French to English", () => {
    const route = readFileSync("app/api/me/push/route.ts", "utf8");
    expect(route).toContain("lang: normalizeLang(b.lang)");
    expect(route).not.toContain('b.lang === "ar" ? "ar" : "en"');
  });
  it("sendToUser no longer forces Arabic", () => {
    const push = readFileSync("lib/push.ts", "utf8");
    expect(push).not.toContain('build("ar")');
    expect(push).toContain("build(normalizeLang(sub.lang))");
  });
  it("the service worker shows notifications with their language and direction", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain("lang: data.lang");
    expect(sw).toContain("dir: data.dir");
  });
  it("triggers, schedules and preference checks are untouched", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> };
    expect(vercel.crons.map((c) => `${c.path} ${c.schedule}`)).toEqual([
      "/api/cron/analyzer-reset 0 0 * * *", "/api/cron/radar-alerts 45 12 * * *",
      "/api/cron/educational 0 15 * * 1,3,5", "/api/cron/elite-promo 0 16 * * 4", "/api/cron/market-intel-snapshot 30 0 * * *",
    ]);
    const push = readFileSync("lib/push.ts", "utf8");
    for (const k of ["prefs.analyzerReset", "prefs.tradeFeed", "prefs.market", "prefs.educational", "prefs.promotional"]) expect(push).toContain(k);
    expect(push).toContain('ent.plan === "elite") return;');
    expect(push).toContain('ent.plan !== "free") return;');
  });
});
