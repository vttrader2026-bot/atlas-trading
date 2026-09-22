import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";
import {
  PUSH_USERS_KEY,
  subsKey,
  endpointId,
  isAllowedEndpoint,
  type StoredSub,
} from "@/lib/push";

export const dynamic = "force-dynamic";

const MAX_DEVICES = 10;

export async function POST(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (typeof body === "object" && body !== null ? body : {}) as {
    subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    lang?: unknown;
  };
  const endpoint = b.subscription?.endpoint;
  const p256dh = b.subscription?.keys?.p256dh;
  const auth = b.subscription?.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    endpoint.length > 2000 ||
    !isAllowedEndpoint(endpoint) ||
    typeof p256dh !== "string" ||
    p256dh.length > 200 ||
    typeof auth !== "string" ||
    auth.length > 100
  ) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  const field = endpointId(endpoint);
  const sub: StoredSub = {
    endpoint,
    keys: { p256dh, auth },
    lang: b.lang === "ar" ? "ar" : "en",
    createdAt: Date.now(),
  };
  try {
    const exists = await ctx.redis.hexists(subsKey(ctx.userId), field);
    if (!exists && (await ctx.redis.hlen(subsKey(ctx.userId))) >= MAX_DEVICES) {
      return NextResponse.json({ error: "Device limit reached" }, { status: 400 });
    }
    await ctx.redis.hset(subsKey(ctx.userId), { [field]: sub });
    await ctx.redis.sadd(PUSH_USERS_KEY, ctx.userId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("push POST failed:", err);
    return NextResponse.json({ error: "Could not save subscription" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const endpoint = (body as { endpoint?: unknown } | null)?.endpoint;
  if (typeof endpoint !== "string" || !endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  try {
    await ctx.redis.hdel(subsKey(ctx.userId), endpointId(endpoint));
    if ((await ctx.redis.hlen(subsKey(ctx.userId))) === 0) {
      await ctx.redis.srem(PUSH_USERS_KEY, ctx.userId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("push DELETE failed:", err);
    return NextResponse.json({ error: "Could not remove subscription" }, { status: 500 });
  }
}