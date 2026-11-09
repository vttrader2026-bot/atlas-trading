// The 23:30 UTC Daily Teaser is gone; every other notification and the shared tradeFeed preference are intact.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as push from "@/lib/push";
import { defaultPrefs, normalizePrefs } from "@/lib/notificationPrefs";

const src = (f: string) => readFileSync(f, "utf8");
const walk = (d: string, out: string[] = []): string[] => {
  for (const n of readdirSync(d)) {
    if (["node_modules", ".next", ".git", "__tests__"].includes(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|json)$/.test(n) && n !== "package-lock.json" && n !== "tsconfig.tsbuildinfo") out.push(p);
  }
  return out;
};

describe("Daily Teaser is removed", () => {
  it("has no cron entry and no route", () => {
    const crons = (JSON.parse(src("vercel.json")) as { crons: Array<{ path: string }> }).crons;
    expect(crons.some((c) => c.path.includes("daily-teaser"))).toBe(false);
    expect(existsSync("app/api/cron/daily-teaser")).toBe(false);
  });
  it("has no sender, payload or dedupe key left in the push library", () => {
    expect((push as Record<string, unknown>).notifyDailyTeaser).toBeUndefined();
    expect((push as Record<string, unknown>).dailyTeaserPayload).toBeUndefined();
    expect(src("lib/push.ts")).not.toMatch(/daily-?teaser|DailyTeaser/i);
  });
  it("is referenced nowhere in app, components or lib source", () => {
    const hits = [...walk("app"), ...walk("components"), ...walk("lib"), "vercel.json"].filter((f) => /daily-?teaser|DailyTeaser/i.test(src(f)));
    expect(hits).toEqual([]);
  });
});

describe("everything else is intact", () => {
  it("keeps the other five cron jobs on their schedules", () => {
    const crons = (JSON.parse(src("vercel.json")) as { crons: Array<{ path: string; schedule: string }> }).crons;
    expect(crons.map((c) => `${c.path} ${c.schedule}`)).toEqual([
      "/api/cron/analyzer-reset 0 0 * * *", "/api/cron/radar-alerts 45 12 * * *",
      "/api/cron/educational 0 15 * * 1,3,5", "/api/cron/elite-promo 0 16 * * 4", "/api/cron/market-intel-snapshot 30 0 * * *",
    ]);
    for (const [route, fn] of [["analyzer-reset", "notifyFreeUsersAnalyzerReset"], ["radar-alerts", "notifyRadarAlerts"], ["educational", "notifyEducational"], ["elite-promo", "notifyElitePromo"]] as const) {
      expect(src(`app/api/cron/${route}/route.ts`)).toContain(fn);
      expect(typeof (push as Record<string, unknown>)[fn]).toBe("function");
    }
    expect(existsSync("app/api/cron/market-intel-snapshot/route.ts")).toBe(true);
  });
  it("keeps the event alerts and they still use the shared tradeFeed preference", () => {
    for (const fn of ["notifyTradeSubscribers", "notifyTpSlSubscribers", "notifyTradeClosedSubscribers"]) {
      expect(typeof (push as Record<string, unknown>)[fn]).toBe("function");
    }
    const p = src("lib/push.ts");
    expect((p.match(/prefs\.tradeFeed/g) ?? []).length).toBe(3); // new signal, TP/SL, trade closed
    expect(src("app/api/trade-feed/route.ts")).toContain("notifyTradeSubscribers");
  });
  it("keeps the tradeFeed preference, its default and its settings toggle", () => {
    expect(defaultPrefs.tradeFeed).toBe(false);
    expect(normalizePrefs({ tradeFeed: true }).tradeFeed).toBe(true);
    expect(src("app/account/page.tsx")).toContain("updatePref({ tradeFeed: v })");
    expect(src("lib/i18n.tsx")).toContain("notifyTradeFeed");
  });
  it("keeps the other payloads with their links", () => {
    expect(push.radarDigestPayload("en").url).toBe("/radar");
    expect(push.eliteNowPayload("fr").url).toBe("/elite");
    expect(push.analyzerResetPayload("ar").url).toBe("/analyzer");
    expect(push.testPayload("en").url).toBe("/account");
  });
});
