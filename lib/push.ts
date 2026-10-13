import webpush from "web-push";
import { createHash } from "crypto";
import { getRedis } from "@/lib/userStore";
import { normalizePrefs } from "@/lib/notificationPrefs";
import { getUserPlan } from "@/lib/plan";
import type { PublishedTrade } from "@/lib/tradeFeed";
import { buildRadarRows, type RadarRow } from "@/lib/radar";
import { getAllTickers24h, getTicker24h } from "@/lib/binance";
import { lessons, type Lesson } from "@/lib/academy-content";

type Lang = "en" | "ar";

export type StoredSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  lang: Lang;
  createdAt: number;
};

type Payload = { title: string; body: string; url: string; tag?: string };

export const PUSH_USERS_KEY = "push:users";
export const subsKey = (userId: string) => `user:${userId}:push`;

const ALLOWED_HOST_SUFFIXES = [".googleapis.com", ".mozilla.com", ".apple.com", ".windows.com"];

export function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && ALLOWED_HOST_SUFFIXES.some((s) => url.hostname.endsWith(s));
  } catch {
    return false;
  }
}

export function endpointId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("base64url").slice(0, 32);
}

function configure(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) {
    console.error("push: VAPID env vars are missing");
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

export function tradePayload(trade: PublishedTrade, lang: Lang): Payload {
  if (lang === "ar") {
    const dir = trade.direction === "Long" ? "شراء" : "بيع";
    return {
      title: "صفقة جديدة: " + trade.pair + " " + dir,
      body: trade.entryZone ? "الدخول: " + trade.entryZone : "Atlas Trading",
      url: "https://www.atlastrading.app/trade-feed",
      tag: "trade-" + trade.id,
    };
  }
  return {
    title: "New trade setup: " + trade.pair + " " + trade.direction,
    body: trade.entryZone ? "Entry: " + trade.entryZone : "Atlas Trading",
    url: "https://www.atlastrading.app/trade-feed",
    tag: "trade-" + trade.id,
  };
}

export function testPayload(lang: Lang): Payload {
  return {
    title: "Atlas Trading",
    body:
      lang === "ar"
        ? "إشعار تجريبي — يعمل بنجاح."
        : "Test notification - it works.",
    url: "/account",
    tag: "atlas-test",
  };
}

export type HitLevel = string;

const TP_LABEL_EN: Record<string, string> = { TP1: "TP1", TP2: "TP2", TP3: "TP3" };
const TP_LABEL_AR: Record<string, string> = {
  TP1: "الهدف الأول",
  TP2: "الهدف الثاني",
  TP3: "الهدف الثالث",
};

export function tpSlPayload(trade: PublishedTrade, level: HitLevel, lang: Lang): Payload {
  const isSl = level === "SL";
  if (lang === "ar") {
    const label = isSl ? "وقف الخسارة" : TP_LABEL_AR[level] || level;
    return {
      title: (isSl ? "إغلاق بوقف الخسارة: " : "تحقق " + label + ": ") + trade.pair,
      body: isSl
        ? "تم إغلاق صفقة " + trade.pair + " عند وقف الخسارة."
        : "وصلت صفقة " + trade.pair + " إلى " + label + ".",
      url: "/trade-feed",
      tag: "trade-" + trade.id + "-" + level,
    };
  }
  const label = isSl ? "Stop-Loss" : TP_LABEL_EN[level] || level;
  return {
    title: (isSl ? "Stop-Loss hit: " : label + " hit: ") + trade.pair,
    body: isSl
      ? trade.pair + " closed at stop-loss."
      : trade.pair + " reached " + label + ".",
    url: "/trade-feed",
    tag: "trade-" + trade.id + "-" + level,
  };
}

export async function notifyTpSlSubscribers(trade: PublishedTrade, level: HitLevel): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis || !configure()) return;
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          if (!prefs.enabled || !prefs.tradeFeed) return;
          await sendToUser(userId, (lang) => tpSlPayload(trade, level, lang));
        }),
      );
    }
  } catch (err) {
    console.error("push: notifyTpSlSubscribers failed", err);
  }
}

export async function sendToUser(userId: string, build: (lang: Lang) => Payload): Promise<number> {
  const redis = getRedis();
  if (!redis || !configure()) return 0;
  const subs = await redis.hgetall<Record<string, StoredSub>>(subsKey(userId));
  if (!subs) return 0;
  let delivered = 0;
  await Promise.allSettled(
    Object.entries(subs).map(async ([field, sub]) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(build("ar")),
          { TTL: 3600 },
        );
        delivered++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await redis.hdel(subsKey(userId), field);
        } else {
          console.error("push: send failed", code);
        }
      }
    }),
  );
  return delivered;
}

export async function notifyTradeSubscribers(trade: PublishedTrade): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis || !configure()) return;
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          if (!prefs.enabled || !prefs.tradeFeed) return;
          await sendToUser(userId, (lang) => tradePayload(trade, lang));
        }),
      );
    }
  } catch (err) {
    console.error("push: notifyTradeSubscribers failed", err);
  }
}

export function tradeClosedPayload(trade: PublishedTrade, lang: Lang): Payload {
  if (lang === "ar") {
    return {
      title: "إغلاق الصفقة: " + trade.pair,
      body: "تم إغلاق صفقة " + trade.pair + ".",
      url: "/trade-feed",
      tag: "trade-" + trade.id + "-closed",
    };
  }
  return {
    title: "Trade closed: " + trade.pair,
    body: trade.pair + " has been closed.",
    url: "/trade-feed",
    tag: "trade-" + trade.id + "-closed",
  };
}

export async function notifyTradeClosedSubscribers(trade: PublishedTrade): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis || !configure()) return;
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          if (!prefs.enabled || !prefs.tradeFeed) return;
          await sendToUser(userId, (lang) => tradeClosedPayload(trade, lang));
        }),
      );
    }
  } catch (err) {
    console.error("push: notifyTradeClosedSubscribers failed", err);
  }
}

export function analyzerResetPayload(): Payload {
  return {
    title: "\u{1F916} تحليلك اليومي جاهز",
    body:
      "لديك تحليلان مجانيان " +
      "اليوم. استخدمهما لتحليل " +
      "الشارت قبل اتخاذ قرارك.",
    url: "/analyzer",
    tag: "analyzer-daily-reset",
  };
}

export async function notifyFreeUsersAnalyzerReset(): Promise<{ sent: number; reason: string }> {
  const redis = getRedis();
  if (!redis || !configure()) return { sent: 0, reason: "redis-or-vapid-not-configured" };

  const day = new Date().toISOString().slice(0, 10);
  const guardKey = `push:analyzer-reset-sent:${day}`;
  const firstRunToday = await redis.set(guardKey, "1", { nx: true, ex: 60 * 60 * 26 });
  if (!firstRunToday) {
    return { sent: 0, reason: "already-sent-today" };
  }

  let sent = 0;
  try {
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          if (!prefs.enabled) return;
          const plan = await getUserPlan(userId);
          if (plan !== "free") return;
          const delivered = await sendToUser(userId, () => analyzerResetPayload());
          if (delivered > 0) sent++;
        }),
      );
    }
  } catch (err) {
    console.error("push: notifyFreeUsersAnalyzerReset failed", err);
  }
  return { sent, reason: "ok" };
}

export function dailyTeaserPayload(): Payload {
  return {
    title: "⚡ Atlas Trading — كن مستعدًا",
    body:
      "ستُنشر صفقة مجانية " +
      "جديدة قريبًا.\nتحقق من " +
      "Trade Feed بعد منتصف الليل.",
    url: "https://www.atlastrading.app/trade-feed",
    tag: "daily-teaser",
  };
}

export async function notifyDailyTeaser(): Promise<{ sent: number; reason: string }> {
  const redis = getRedis();
  if (!redis || !configure()) return { sent: 0, reason: "redis-or-vapid-not-configured" };

  const day = new Date().toISOString().slice(0, 10);
  const guardKey = `push:daily-teaser-sent:${day}`;
  const firstRunToday = await redis.set(guardKey, "1", { nx: true, ex: 60 * 60 * 26 });
  if (!firstRunToday) {
    return { sent: 0, reason: "already-sent-today" };
  }

  let sent = 0;
  try {
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          if (!prefs.enabled || !prefs.tradeFeed) return;
          const delivered = await sendToUser(userId, () => dailyTeaserPayload());
          if (delivered > 0) sent++;
        }),
      );
    }
  } catch (err) {
    console.error("push: notifyDailyTeaser failed", err);
  }
  return { sent, reason: "ok" };
}

const RADAR_ALERT_COOLDOWN_SEC = 6 * 60 * 60; // don't re-alert the same symbol+setup for 6h
const RADAR_ALERT_MAX_PER_RUN = 5; // cap fan-out per cron run

function radarAlertEligible(row: RadarRow): boolean {
  return row.setup === "breakout" || row.setup === "relativeStrength";
}

export function radarAlertPayload(row: RadarRow, lang: Lang): Payload {
  const symbol = row.ticker.symbol.replace(/USDT$/, "");
  const sign = row.change >= 0 ? "+" : "";
  const changeStr = sign + row.change.toFixed(1) + "%";
  if (lang === "ar") {
    const label =
      row.setup === "breakout"
        ? "اختراق"
        : "قوة نسبية";
    return {
      title: symbol + " — " + label,
      body:
        symbol + " " + changeStr + " خلال 24 ساعة. " +
        "شاهده في الرادار.",
      url: "/radar",
      tag: "radar-" + row.ticker.symbol + "-" + row.setup,
    };
  }
  const label = row.setup === "breakout" ? "Breakout" : "Relative Strength";
  return {
    title: symbol + " — " + label,
    body: symbol + " " + changeStr + " over 24h. See it on Radar.",
    url: "/radar",
    tag: "radar-" + row.ticker.symbol + "-" + row.setup,
  };
}

export async function notifyRadarAlerts(): Promise<{ sent: number; reason: string }> {
  const redis = getRedis();
  if (!redis || !configure()) return { sent: 0, reason: "redis-or-vapid-not-configured" };

  let rows: RadarRow[];
  try {
    const [tickers, btc] = await Promise.all([getAllTickers24h(), getTicker24h("BTCUSDT")]);
    const btcChangePct = btc ? parseFloat(btc.priceChangePercent) : 0;
    rows = buildRadarRows(tickers, btcChangePct).filter(radarAlertEligible);
  } catch (err) {
    console.error("push: notifyRadarAlerts could not load market data", err);
    return { sent: 0, reason: "market-data-unavailable" };
  }

  // Strongest movers first, capped, so one noisy run can't flood everyone.
  rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  const eligibleRows: RadarRow[] = [];
  for (const row of rows) {
    if (eligibleRows.length >= RADAR_ALERT_MAX_PER_RUN) break;
    const guardKey = `push:radar-alert-sent:${row.ticker.symbol}:${row.setup}`;
    const firstTimeThisWindow = await redis.set(guardKey, "1", { nx: true, ex: RADAR_ALERT_COOLDOWN_SEC });
    if (firstTimeThisWindow) eligibleRows.push(row);
  }
  if (eligibleRows.length === 0) return { sent: 0, reason: "no-new-setups" };

  let sent = 0;
  try {
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          if (!prefs.enabled || !prefs.market) return;
          for (const row of eligibleRows) {
            const delivered = await sendToUser(userId, (lang) => radarAlertPayload(row, lang));
            if (delivered > 0) sent++;
          }
        }),
      );
    }
  } catch (err) {
    console.error("push: notifyRadarAlerts failed", err);
  }
  return { sent, reason: "ok" };
}

export function educationalPayload(lesson: Lesson, lang: Lang): Payload {
  if (lang === "ar") {
    return {
      title: "من أكاديمية Atlas: " + lesson.title.ar,
      body: lesson.summary.ar,
      url: "/academy/" + lesson.slug,
      tag: "academy-" + lesson.slug,
    };
  }
  return {
    title: "From Atlas Academy: " + lesson.title.en,
    body: lesson.summary.en,
    url: "/academy/" + lesson.slug,
    tag: "academy-" + lesson.slug,
  };
}

export async function notifyEducational(): Promise<{ sent: number; reason: string }> {
  const redis = getRedis();
  if (!redis || !configure()) return { sent: 0, reason: "redis-or-vapid-not-configured" };

  const day = new Date().toISOString().slice(0, 10);
  const guardKey = `push:educational-sent:${day}`;
  const firstRunToday = await redis.set(guardKey, "1", { nx: true, ex: 60 * 60 * 26 });
  if (!firstRunToday) {
    return { sent: 0, reason: "already-sent-today" };
  }

  const pool = lessons.filter((l) => l.ready);
  if (pool.length === 0) return { sent: 0, reason: "no-lessons-available" };
  const pick = pool[Math.floor(Math.random() * pool.length)];

  let sent = 0;
  try {
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          if (!prefs.enabled || !prefs.educational) return;
          const delivered = await sendToUser(userId, (lang) => educationalPayload(pick, lang));
          if (delivered > 0) sent++;
        }),
      );
    }
  } catch (err) {
    console.error("push: notifyEducational failed", err);
  }
  return { sent, reason: "ok" };
}

export function eliteNowPayload(lang: Lang): Payload {
  if (lang === "ar") {
    return {
      title: "Atlas Elite",
      body:
        "تحليل أعمق، حدود أعلى، " +
        "وأدوات حصرية لأعضاء Elite. " +
        "استكشف ما يشمله.",
      url: "/elite",
      tag: "elite-promo",
    };
  }
  return {
    title: "Atlas Elite",
    body: "Deeper analysis, higher limits, and tools built for Elite members. See what's included.",
    url: "/elite",
    tag: "elite-promo",
  };
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return date.getUTCFullYear() + "-W" + weekNum;
}

export async function notifyElitePromo(): Promise<{ sent: number; reason: string }> {
  const redis = getRedis();
  if (!redis || !configure()) return { sent: 0, reason: "redis-or-vapid-not-configured" };

  const week = isoWeekKey(new Date());
  const guardKey = `push:elite-promo-sent:${week}`;
  const firstRunThisWeek = await redis.set(guardKey, "1", { nx: true, ex: 60 * 60 * 24 * 8 });
  if (!firstRunThisWeek) {
    return { sent: 0, reason: "already-sent-this-week" };
  }

  let sent = 0;
  try {
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          if (!prefs.enabled || !prefs.promotional) return;
          const plan = await getUserPlan(userId);
          if (plan !== "free") return; // never promo existing Elite members
          const delivered = await sendToUser(userId, (lang) => eliteNowPayload(lang));
          if (delivered > 0) sent++;
        }),
      );
    }
  } catch (err) {
    console.error("push: notifyElitePromo failed", err);
  }
  return { sent, reason: "ok" };
}
