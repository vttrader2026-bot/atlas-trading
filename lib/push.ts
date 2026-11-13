import webpush from "web-push";
import { createHash } from "crypto";
import { getRedis } from "@/lib/userStore";
import { normalizePrefs } from "@/lib/notificationPrefs";
import { analyzeLimitForPlan, getUserPlan } from "@/lib/plan";
import type { PublishedTrade } from "@/lib/tradeFeed";
import { buildRadarRows, type RadarRow } from "@/lib/radar";
import { getAllTickers24h, getTicker24h, getSpotTradingSymbols } from "@/lib/binance";
import { lessons, type Lesson } from "@/lib/academy-content";
import { baseSymbol, coinNameFor } from "@/lib/coinName";

export type Lang = "en" | "ar" | "fr";

/** Anything that is not exactly "ar" or "fr" (old or missing values) falls back to English. */
export function normalizeLang(v: unknown): Lang {
  return v === "ar" || v === "fr" ? v : "en";
}

export type StoredSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  lang: Lang;
  createdAt: number;
};

// `lang` and `dir` are Notification options: Arabic notifications are marked right-to-left so the text and the
// Latin pair names inside it are laid out correctly. sendToUser fills them in from the subscription's language.
type Payload = { title: string; body: string; url: string; tag?: string; lang?: string; dir?: "rtl" | "ltr" };

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

// SIGNAL-NOTIFY-v1
// ONE notification for every new signal, FREE or ELITE, from the website or the Telegram bot. It carries no trade
// details (no entry, SL or TP) and the same text goes to everyone who receives signal notifications; who may OPEN the
// signal is decided by the Trade Feed API, not here. `coinName` is looked up once per signal by the caller.
export function tradePayload(trade: PublishedTrade, _lang: Lang, coinName?: string | null): Payload {
  void _lang; // the wording is fixed (same for every language), as specified
  const symbol = baseSymbol(trade.pair) ?? String(trade.pair ?? "").toUpperCase();
  return {
    title: "\u26A1 BUY SIGNAL",
    body: "New signal: " + (coinName && coinName.toUpperCase() !== symbol ? coinName + " (" + symbol + ")" : symbol),
    url: "https://www.atlastrading.app/trade-feed",
    tag: "signal-" + trade.id,
    lang: "en",
    dir: "ltr",
  };
}

export function testPayload(lang: Lang): Payload {
  return {
    title: "Atlas Trading",
    body:
      lang === "ar"
        ? "إشعار تجريبي — يعمل بنجاح."
        : lang === "fr"
          ? "Notification de test - tout fonctionne."
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
  if (lang === "fr") {
    const label = TP_LABEL_EN[level] || level;
    return {
      title: isSl ? "Stop-loss atteint : " + trade.pair : label + " atteint : " + trade.pair,
      body: isSl ? trade.pair + " clôturé au stop-loss." : trade.pair + " a atteint " + label + ".",
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
          await sendToUser(userId, (lang) => tpSlPayload(trade, level, lang), TP_SL_PUSH_TTL);
        }),
      );
    }
  } catch (err) {
    console.error("push: notifyTpSlSubscribers failed", err);
  }
}

// LOCK-SAFETY-v1: the daily/weekly guards are claimed (SET NX) before sending so concurrent runs cannot both send.
// If nobody received the notification (a failed send, a failed read, a crashed loop) the guard is released again so the
// next cron run can retry. Once at least one device was reached the guard stays: no duplicates, no re-send.
type RunStats = { sent: number; attempted: number; failed: number; threw: boolean };
const newStats = (): RunStats => ({ sent: 0, attempted: 0, failed: 0, threw: false });
const countRejected = (rs: PromiseSettledResult<unknown>[]) => rs.filter((r) => r.status === "rejected").length;

async function releaseIfUndelivered(redis: NonNullable<ReturnType<typeof getRedis>>, keys: string[], st: RunStats): Promise<void> {
  if (st.sent > 0 || (st.attempted === 0 && st.failed === 0 && !st.threw)) return;
  for (const key of keys) {
    try {
      await redis.del(key);
    } catch (err) {
      console.error("push: could not release lock", key, err);
    }
  }
}

function withLocale(p: Payload, lang: Lang): Payload {
  return { ...p, lang: p.lang ?? lang, dir: p.dir ?? (lang === "ar" ? "rtl" : "ltr") };
}

/** Default push expiry (seconds). */
export const DEFAULT_PUSH_TTL = 60 * 60;
/** TP/SL alerts stay deliverable for 12 hours, so a phone that was off or offline still gets them. */
export const TP_SL_PUSH_TTL = 12 * 60 * 60;

export async function sendToUser(userId: string, build: (lang: Lang) => Payload, ttl: number = DEFAULT_PUSH_TTL): Promise<number> {
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
          JSON.stringify(withLocale(build(normalizeLang(sub.lang)), normalizeLang(sub.lang))),
          { TTL: ttl },
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
    // Never notify twice for the same signal, even if this is invoked again (retry, double call). The bot's own
    // id (e.g. "T268") is guarded too: a bot retry of the same signal creates a new feed record (new uuid) but is
    // still the same signal, so it must not notify again.
    const ttl = { nx: true, ex: 60 * 60 * 24 * 7 } as const;
    if (trade.tradeId) {
      const firstBot = await redis.set(`push:signal-sent:bot:${trade.tradeId}`, "1", ttl);
      if (!firstBot) return;
    }
    const first = await redis.set(`push:signal-sent:${trade.id}`, "1", ttl);
    if (!first) return;
    const symbol = baseSymbol(trade.pair);
    const coinName = symbol ? await coinNameFor(symbol, redis) : null;
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          if (!prefs.enabled || !prefs.tradeFeed) return;
          await sendToUser(userId, (lang) => tradePayload(trade, lang, coinName));
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
  if (lang === "fr") {
    return {
      title: "Trade clôturé : " + trade.pair,
      body: "Le trade " + trade.pair + " a été clôturé.",
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

function freeAnalysesText(lang: Lang, n: number): string {
  if (lang === "ar") return n === 1 ? "تحليل مجاني واحد" : n === 2 ? "تحليلان مجانيان" : n + " تحليلات مجانية";
  if (lang === "fr") return n === 1 ? "1 analyse gratuite" : n + " analyses gratuites";
  return n === 1 ? "1 free analysis" : n + " free analyses";
}

// `limit` is the FREE plan's daily analysis allowance (lib/plan.ts is the single source of truth).
export function analyzerResetPayload(lang: Lang = "ar", limit: number = analyzeLimitForPlan("free")): Payload {
  const n = freeAnalysesText(lang, limit);
  if (lang === "fr") {
    return {
      title: "\u{1F916} Votre analyse du jour est prête",
      body: "Vous avez " + n + " aujourd'hui. Utilisez-les pour analyser le graphique avant de prendre votre décision.",
      url: "/analyzer",
      tag: "analyzer-daily-reset",
    };
  }
  if (lang === "en") {
    return {
      title: "\u{1F916} Your daily analysis is ready",
      body: "You have " + n + " today. Use them to analyze the chart before making your decision.",
      url: "/analyzer",
      tag: "analyzer-daily-reset",
    };
  }
  return {
    title: "\u{1F916} تحليلك اليومي جاهز",
    body: "لديك " + n + " اليوم. استخدمها لتحليل الشارت قبل اتخاذ قرارك.",
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

  const limit = analyzeLimitForPlan("free");
  const st = newStats();
  try {
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      const rs = await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          // Its own toggle, not just the master switch - not everyone wants a
          // midnight ping, so this stays strictly opt-in.
          if (!prefs.enabled || !prefs.analyzerReset) return;
          const plan = await getUserPlan(userId);
          if (plan !== "free") return;
          st.attempted++;
          const delivered = await sendToUser(userId, (lang) => analyzerResetPayload(lang, limit));
          if (delivered > 0) st.sent++;
        }),
      );
      st.failed += countRejected(rs);
    }
  } catch (err) {
    st.threw = true;
    console.error("push: notifyFreeUsersAnalyzerReset failed", err);
  }
  await releaseIfUndelivered(redis, [guardKey], st);
  return { sent: st.sent, reason: "ok" };
}

const RADAR_ALERT_COOLDOWN_SEC = 20 * 60 * 60; // don't re-alert the same symbol+setup for ~a day
const RADAR_ALERT_MAX_PER_RUN = 5; // cap how many symbols count toward "genuinely useful" per run

// These kept showing up as "breakout" / "relative strength" every single day -
// thin, low-liquidity pairs trivially satisfy those thresholds on ordinary
// daily noise (a barely-moving 24h range makes "near high" meaningless, and
// small caps routinely swing >2pp vs BTC without it meaning anything). Belt
// and suspenders: block them by name, and require real liquidity below.
const RADAR_ALERT_EXCLUDED_SYMBOLS = new Set(["STGUSDT", "LSKUSDT", "ERAUSDT", "PNTUSDT"]);

function radarAlertEligible(row: RadarRow): boolean {
  if (RADAR_ALERT_EXCLUDED_SYMBOLS.has(row.ticker.symbol)) return false;
  // Root-cause fix: only count a setup if the pair is also genuinely liquid
  // (top 40 by quote volume). Thin pairs were the whole reason this fired
  // every day regardless of whether anything real was happening.
  if (!row.tags.includes("highVolume")) return false;
  return row.setup === "breakout" || row.setup === "relativeStrength";
}

export function radarDigestPayload(lang: Lang): Payload {
  if (lang === "ar") {
    return {
      title: "رادار أطلس — نشاط السوق يتصاعد",
      body:
        "تحقق من السوق بحثًا عن اختراقات وارتدادات وإعدادات قوة نسبية " +
        "مؤهلة قبل بداية جلسة التداول الأمريكية الرئيسية.",
      url: "/radar",
      tag: "radar-digest",
    };
  }
  if (lang === "fr") {
    return {
      title: "Atlas Radar — L'activité du marché s'intensifie",
      body:
        "Consultez le marché pour repérer les cassures, les repliements et les setups de force " +
        "relative qualifiés avant la session de trading américaine principale.",
      url: "/radar",
      tag: "radar-digest",
    };
  }
  return {
    title: "Atlas Radar — Market Activity Is Building",
    body:
      "Check the market for qualifying breakouts, pullbacks, and " +
      "relative-strength setups before the main US trading session.",
    url: "/radar",
    tag: "radar-digest",
  };
}

export async function notifyRadarAlerts(): Promise<{ sent: number; reason: string }> {
  const redis = getRedis();
  if (!redis || !configure()) return { sent: 0, reason: "redis-or-vapid-not-configured" };

  let rows: RadarRow[];
  try {
    const [tickers, btc, spot] = await Promise.all([getAllTickers24h(), getTicker24h("BTCUSDT"), getSpotTradingSymbols()]);
    const btcChangePct = btc ? parseFloat(btc.priceChangePercent) : 0;
    rows = buildRadarRows(tickers, btcChangePct, spot).filter(radarAlertEligible);
  } catch (err) {
    console.error("push: notifyRadarAlerts could not load market data", err);
    return { sent: 0, reason: "market-data-unavailable" };
  }

  // Strongest movers first, capped, so one noisy run can't flood everyone.
  rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  const eligibleRows: RadarRow[] = [];
  const claimedKeys: string[] = [];
  for (const row of rows) {
    if (eligibleRows.length >= RADAR_ALERT_MAX_PER_RUN) break;
    const guardKey = `push:radar-alert-sent:${row.ticker.symbol}:${row.setup}`;
    const firstTimeThisWindow = await redis.set(guardKey, "1", { nx: true, ex: RADAR_ALERT_COOLDOWN_SEC });
    if (firstTimeThisWindow) { eligibleRows.push(row); claimedKeys.push(guardKey); }
  }
  // Nothing genuinely new/liquid today - stay silent rather than notify out
  // of habit. This is the fix for "it always sends every day."
  if (eligibleRows.length === 0) return { sent: 0, reason: "no-new-setups" };

  // One consolidated "go check Radar" ping, not a per-symbol flood - the
  // eligibility check above already did the filtering.
  const st = newStats();
  try {
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      const rs = await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          if (!prefs.enabled || !prefs.market) return;
          st.attempted++;
          const delivered = await sendToUser(userId, (lang) => radarDigestPayload(lang));
          if (delivered > 0) st.sent++;
        }),
      );
      st.failed += countRejected(rs);
    }
  } catch (err) {
    st.threw = true;
    console.error("push: notifyRadarAlerts failed", err);
  }
  await releaseIfUndelivered(redis, claimedKeys, st);
  return { sent: st.sent, reason: "ok" };
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
  if (lang === "fr") {
    return {
      title: "De l'Académie Atlas : " + lesson.title.fr,
      body: lesson.summary.fr,
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

  const st = newStats();
  try {
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      const rs = await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          if (!prefs.enabled || !prefs.educational) return;
          st.attempted++;
          const delivered = await sendToUser(userId, (lang) => educationalPayload(pick, lang));
          if (delivered > 0) st.sent++;
        }),
      );
      st.failed += countRejected(rs);
    }
  } catch (err) {
    st.threw = true;
    console.error("push: notifyEducational failed", err);
  }
  await releaseIfUndelivered(redis, [guardKey], st);
  return { sent: st.sent, reason: "ok" };
}

export function eliteNowPayload(lang: Lang): Payload {
  if (lang === "ar") {
    return {
      title: "Atlas Elite",
      body: "افتح إشارات سبوت حصرية، وأدوات تحليل متقدمة، وإدارة كاملة للصفقات — كل ذلك في عضوية واحدة.",
      url: "/elite",
      tag: "elite-promo",
    };
  }
  if (lang === "fr") {
    return {
      title: "Atlas Elite",
      body: "Débloquez des signaux spot exclusifs, des outils d'analyse avancés et une gestion complète des trades — le tout dans un seul abonnement.",
      url: "/elite",
      tag: "elite-promo",
    };
  }
  return {
    title: "Atlas Elite",
    body: "Unlock exclusive spot signals, advanced analysis tools and complete trade management — all in one membership.",
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

  const st = newStats();
  try {
    const userIds = await redis.smembers<string[]>(PUSH_USERS_KEY);
    for (let i = 0; i < userIds.length; i += 20) {
      const rs = await Promise.allSettled(
        userIds.slice(i, i + 20).map(async (userId) => {
          const prefs = normalizePrefs(await redis.get(`user:${userId}:prefs`));
          if (!prefs.enabled || !prefs.promotional) return;
          const plan = await getUserPlan(userId);
          if (plan === "elite") return; // never promo existing Elite members
          st.attempted++;
          const delivered = await sendToUser(userId, (lang) => eliteNowPayload(lang));
          if (delivered > 0) st.sent++;
        }),
      );
      st.failed += countRejected(rs);
    }
  } catch (err) {
    st.threw = true;
    console.error("push: notifyElitePromo failed", err);
  }
  await releaseIfUndelivered(redis, [guardKey], st);
  return { sent: st.sent, reason: "ok" };
}
