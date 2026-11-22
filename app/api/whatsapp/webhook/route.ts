// WHATSAPP-BOT-v2: receives Kapso webhooks and sends fixed, free answers.
// Needs KAPSO_WEBHOOK_SECRET and KAPSO_API_KEY (KAPSO_PHONE_NUMBER_ID is optional). It never touches the Telegram trade bot.
// Events used: whatsapp.message.received (customer messages) and whatsapp.message.sent (to notice the owner replying by hand).
// The bot goes quiet in a chat only after the owner replies manually; the owner sends "/bot" in that chat to hand it back.
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { notifyAdmin } from "@/lib/telegram";
import {
  answerToMediaPrompt, decide, detectLang, isResumeCommand, langFor, mediaPromptText, parseIncoming, parseOutbound, replyFor, verifySignature,
  type Incoming, type Lang, type Outgoing,
} from "@/lib/whatsappBot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_REPLY_CAP = 20; // replies per customer per day: keeps the free 2,000 messages a month safe
const SEEN_TTL_S = 2 * 24 * 60 * 60;
const MANUAL_PAUSE_S = 7 * 24 * 60 * 60; // safety net only: refreshed by every manual reply, and "/bot" ends it at once
const BOT_BODY_TTL_S = 24 * 60 * 60; // how long we remember what the bot itself sent
const MEDIA_STATE_TTL_S = 6 * 60 * 60; // how long "1 / 2" answers the attachment prompt
const NOTIFY_EVERY_S = 30 * 60; // at most one owner alert per customer every 30 minutes
const LANG_TTL_S = 30 * 24 * 60 * 60;

const botKey = (body: string) => `wa:bot:${createHash("sha256").update(body.trim()).digest("hex").slice(0, 24)}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function send(inc: Incoming, body: string, redis: NonNullable<ReturnType<typeof getRedis>>): Promise<boolean> {
  const key = process.env.KAPSO_API_KEY;
  const pn = process.env.KAPSO_PHONE_NUMBER_ID || inc.phoneNumberId;
  if (!key || !pn) return false;
  // Remember the text BEFORE sending, so the "sent" webhook for it can never be mistaken for the owner typing.
  await redis.set(botKey(body), "1", { ex: BOT_BODY_TTL_S });
  const to = "phone" in inc.to ? { to: inc.to.phone } : { recipient_type: "individual", recipient: inc.to.bsuid };
  const res = await fetch(`https://api.kapso.ai/meta/whatsapp/v24.0/${encodeURIComponent(pn)}/messages`, {
    method: "POST",
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...to, type: "text", text: { body } }),
    signal: AbortSignal.timeout(6000),
  });
  return res.ok;
}

/** Tells the owner (existing Telegram admin alert) that a customer asked for them. Never blocks or fails the reply. */
async function alertOwner(inc: Incoming, redis: NonNullable<ReturnType<typeof getRedis>>, afterAttachment: boolean) {
  try {
    if (!(await redis.set(`wa:notified:${inc.senderKey}`, "1", { nx: true, ex: NOTIFY_EVERY_S }))) return;
    const what = afterAttachment ? "(sent an attachment, then chose to talk to you)" : inc.text ? esc(inc.text.slice(0, 200)) : "(attachment)";
    await notifyAdmin(`💬 <b>WhatsApp: a customer asked for you</b>\nFrom: ${esc(inc.senderKey)}\nMessage: ${what}\n\nReply from Kapso. The bot pauses in that chat while you answer; send /bot there to hand it back.`);
  } catch (err) {
    console.error("whatsapp: owner alert failed", err);
  }
}

/** The owner's own message left our number: pause the bot in that chat, or resume it on "/bot". */
async function handleSent(o: Outgoing, redis: NonNullable<ReturnType<typeof getRedis>>) {
  if (isResumeCommand(o.text)) {
    for (const k of o.keys) await redis.del(`wa:manual:${k}`);
    return;
  }
  // Messages the bot sent itself arrive here too. Text from the WhatsApp Business app is always the owner.
  if (o.origin !== "business_app" && o.text !== null && (await redis.get(botKey(o.text)))) return;
  for (const k of o.keys) await redis.set(`wa:manual:${k}`, "1", { ex: MANUAL_PAUSE_S });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-webhook-signature"), process.env.KAPSO_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const event = req.headers.get("x-webhook-event");
  if (event !== "whatsapp.message.received" && event !== "whatsapp.message.sent") return NextResponse.json({ ok: true, ignored: true });

  let body: { batch?: boolean; data?: unknown } | null;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const redis = getRedis();
  if (!redis) return NextResponse.json({ ok: true, ignored: "no-redis" }); // no duplicate protection, so stay silent

  if (event === "whatsapp.message.sent") {
    const o = parseOutbound(body);
    if (!o) return NextResponse.json({ ok: true, ignored: true });
    try { await handleSent(o, redis); } catch (err) { console.error("whatsapp: sent handler failed", err); return NextResponse.json({ error: "failed" }, { status: 500 }); }
    return NextResponse.json({ ok: true });
  }

  const payloads: unknown[] = body?.batch === true && Array.isArray(body.data) ? (body.data as unknown[]) : [body];
  let failed = false;
  for (const p of payloads) {
    const inc = parseIncoming(p);
    if (!inc) continue;
    const seenKey = `wa:seen:${inc.messageId}`;
    // One reply per message even if Kapso retries.
    if (!(await redis.set(seenKey, "1", { nx: true, ex: SEEN_TTL_S }))) continue;
    try {
      // The owner answered this chat by hand: stay quiet until they send "/bot".
      let paused = false;
      for (const k of inc.keys) if (await redis.get(`wa:manual:${k}`)) paused = true;
      if (paused) continue;

      const day = new Date().toISOString().slice(0, 10);
      const capKey = `wa:cap:${inc.senderKey}:${day}`;
      const n = await redis.incr(capKey);
      if (n === 1) await redis.expire(capKey, 26 * 3600);
      if (n > DAILY_REPLY_CAP) continue;

      const prefRaw = await redis.get(`wa:lang:${inc.senderKey}`);
      const pref: Lang | null = prefRaw === "ar" || prefRaw === "fr" || prefRaw === "en" ? prefRaw : null;
      const mediaKey = `wa:media:${inc.senderKey}`;
      let reply: string;
      let handoff = false;
      let afterAttachment = false;
      let afterSend: (() => Promise<void>) | null = null;

      if (inc.kind === "media") {
        reply = mediaPromptText();
        afterSend = async () => { await redis.set(mediaKey, "1", { ex: MEDIA_STATE_TTL_S }); };
      } else if (inc.kind === "other" || inc.text === null) {
        reply = replyFor("menu", pref ?? "en");
      } else {
        const waiting = await redis.get(mediaKey);
        const choice = waiting ? answerToMediaPrompt(inc.text) : null;
        const lang = langFor(inc.text, pref);
        if (choice === "menu") reply = replyFor("menu", lang);
        else if (choice === "human") { reply = replyFor("human", lang); handoff = true; afterAttachment = true; }
        else { const d = decide(inc.text, pref); reply = d.reply; handoff = d.handoff; }
        afterSend = async () => {
          if (waiting) await redis.del(mediaKey);
          if (/[a-z؀-ۿ]{3}/i.test(inc.text!)) await redis.set(`wa:lang:${inc.senderKey}`, detectLang(inc.text!), { ex: LANG_TTL_S });
        };
      }

      if (!(await send(inc, reply, redis))) throw new Error("send failed");
      if (afterSend) { try { await afterSend(); } catch (err) { console.error("whatsapp: state update failed", err); } } // the reply is already out: never resend it
      if (handoff) await alertOwner(inc, redis, afterAttachment); // the bot keeps answering; it only pauses when the owner replies by hand
    } catch {
      await redis.del(seenKey); // let Kapso's retry try again
      failed = true;
    }
  }
  return failed ? NextResponse.json({ error: "send failed" }, { status: 500 }) : NextResponse.json({ ok: true });
}
