import webpush from "web-push";
import { createHash } from "crypto";
import { getRedis } from "@/lib/userStore";
import { normalizePrefs } from "@/lib/notificationPrefs";
import type { PublishedTrade } from "@/lib/tradeFeed";

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

// The server sends to this URL, so only accept real browser push services.
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
    const dir = trade.direction === "Long" ? "\u0634\u0631\u0627\u0621" : "\u0628\u064a\u0639";
    return {
      title: "\u0635\u0641\u0642\u0629 \u062c\u062f\u064a\u062f\u0629: " + trade.pair + " " + dir,
      body: trade.entryZone ? "\u0627\u0644\u062f\u062e\u0648\u0644: " + trade.entryZone : "Atlas Trading",
      url: "/trade-feed",
      tag: "trade-" + trade.id,
    };
  }
  return {
    title: "New trade setup: " + trade.pair + " " + trade.direction,
    body: trade.entryZone ? "Entry: " + trade.entryZone : "Atlas Trading",
    url: "/trade-feed",
    tag: "trade-" + trade.id,
  };
}

export function testPayload(lang: Lang): Payload {
  return {
    title: "Atlas Trading",
    body:
      lang === "ar"
        ? "\u0625\u0634\u0639\u0627\u0631 \u062a\u062c\u0631\u064a\u0628\u064a \u2014 \u064a\u0639\u0645\u0644 \u0628\u0646\u062c\u0627\u062d."
        : "Test notification - it works.",
    url: "/account",
    tag: "atlas-test",
  };
}

/** Sends to all of one user's devices. Returns how many deliveries succeeded. */
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
          JSON.stringify(build(sub.lang === "ar" ? "ar" : "en")),
          { TTL: 3600 },
        );
        delivered++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          // The browser dropped this subscription: forget it.
          await redis.hdel(subsKey(userId), field);
        } else {
          console.error("push: send failed", code);
        }
      }
    }),
  );
  return delivered;
}

/** Notifies everyone who turned on notifications and "new trade setups". Never throws. */
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