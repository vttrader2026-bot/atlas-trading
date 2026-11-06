// ADMIN-v1: owner-only access for /admin and /api/admin/*. The ONLY thing that grants access is the signed-in Clerk
// user id matching OWNER_CLERK_USER_ID, checked on the server. Not an email, not a header, not anything the client sends.
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { timingSafeEqual } from "crypto";

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/** True only for the exact owner id. Fails closed when OWNER_CLERK_USER_ID is unset or empty. */
export function isOwnerId(userId: string | null | undefined): userId is string {
  const owner = (process.env.OWNER_CLERK_USER_ID ?? "").trim();
  return !!owner && typeof userId === "string" && userId.length > 0 && safeEqual(userId, owner);
}

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Route guard. Returns the owner's id, or a ready-made 404 (strangers learn nothing about the admin API).
 * For writes it also refuses a request whose Origin is another site.
 */
export async function requireOwner(req?: Request): Promise<{ userId: string } | NextResponse> {
  if (!(process.env.OWNER_CLERK_USER_ID ?? "").trim()) console.error("admin: OWNER_CLERK_USER_ID is not set, admin is locked");
  const { userId } = await auth();
  if (!isOwnerId(userId)) return notFound();
  if (req && req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin) {
      let same = false;
      try {
        same = !!host && new URL(origin).host === host;
      } catch {
        same = false;
      }
      if (!same) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
  }
  return { userId };
}

/** Sensitive actions must carry an explicit confirmation from the dialog. */
export function needsConfirm(body: Record<string, unknown>): NextResponse | null {
  return body.confirm === true ? null : NextResponse.json({ error: "Confirmation required" }, { status: 400 });
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const noStore = { "Cache-Control": "no-store" } as const;

/** Best-effort audit trail of every admin write (newest first, last 1000). Never blocks the action. */
export async function auditLog(redis: { lpush: (k: string, ...v: unknown[]) => Promise<unknown>; ltrim: (k: string, a: number, b: number) => Promise<unknown> } | null, actor: string, action: string, target: string, detail: Record<string, unknown> = {}) {
  if (!redis) return;
  try {
    await redis.lpush("atlas:admin-audit", { at: Date.now(), actor, action, target, ...detail });
    await redis.ltrim("atlas:admin-audit", 0, 999);
  } catch (err) {
    console.error("admin: audit log failed", err);
  }
}
