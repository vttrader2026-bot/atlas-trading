// WHATSAPP-BOT-v1: receives Kapso "whatsapp.message.received" webhooks and sends a fixed, free answer.
// Needs KAPSO_WEBHOOK_SECRET and KAPSO_API_KEY (KAPSO_PHONE_NUMBER_ID is optional). It never touches the Telegram trade bot.
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { decide, parseIncoming, replyFor, verifySignature, type Incoming } from "@/lib/whatsappBot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_REPLY_CAP = 20; // replies per customer per day: keeps the free 2,000 messages a month safe
const HANDOFF_SILENCE_S = 12 * 60 * 60; // after a person is requested, the bot stays quiet this long
const SEEN_TTL_S = 2 * 24 * 60 * 60;

async function send(inc: Incoming, body: string): Promise<boolean> {
  const key = process.env.KAPSO_API_KEY;
  const pn = process.env.KAPSO_PHONE_NUMBER_ID || inc.phoneNumberId;
  if (!key || !pn) return false;
  const to = "phone" in inc.to ? { to: inc.to.phone } : { recipient_type: "individual", recipient: inc.to.bsuid };
  const res = await fetch(`https://api.kapso.ai/meta/whatsapp/v24.0/${encodeURIComponent(pn)}/messages`, {
    method: "POST",
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...to, type: "text", text: { body } }),
    signal: AbortSignal.timeout(6000),
  });
  return res.ok;
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-webhook-signature"), process.env.KAPSO_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  // Only customer messages. Every other event is acknowledged and ignored.
  if (req.headers.get("x-webhook-event") !== "whatsapp.message.received") return NextResponse.json({ ok: true, ignored: true });

  let body: { batch?: boolean; data?: unknown } | null;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const payloads: unknown[] = body?.batch === true && Array.isArray(body.data) ? (body.data as unknown[]) : [body];

  const redis = getRedis();
  if (!redis) return NextResponse.json({ ok: true, ignored: "no-redis" }); // no duplicate protection, so stay silent

  let failed = false;
  for (const p of payloads) {
    const inc = parseIncoming(p);
    if (!inc) continue;
    const seenKey = `wa:seen:${inc.messageId}`;
    // One reply per message even if Kapso retries.
    if (!(await redis.set(seenKey, "1", { nx: true, ex: SEEN_TTL_S }))) continue;
    try {
      if (await redis.get(`wa:quiet:${inc.senderKey}`)) continue; // a person has taken over this chat
      const day = new Date().toISOString().slice(0, 10);
      const capKey = `wa:cap:${inc.senderKey}:${day}`;
      const n = await redis.incr(capKey);
      if (n === 1) await redis.expire(capKey, 26 * 3600);
      if (n > DAILY_REPLY_CAP) continue;

      // Photos, voice notes and other non-text messages go straight to a person.
      const d = inc.text === null ? { reply: replyFor("human", "en"), handoff: true } : decide(inc.text);
      const reply = inc.text === null ? `${replyFor("human", "en")}\n\n${replyFor("human", "ar")}` : d.reply;
      if (!(await send(inc, reply))) throw new Error("send failed");
      if (d.handoff) await redis.set(`wa:quiet:${inc.senderKey}`, "1", { ex: HANDOFF_SILENCE_S });
    } catch {
      await redis.del(seenKey); // let Kapso's retry try again
      failed = true;
    }
  }
  return failed ? NextResponse.json({ error: "send failed" }, { status: 500 }) : NextResponse.json({ ok: true });
}
