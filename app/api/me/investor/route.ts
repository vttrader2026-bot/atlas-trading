// ATLAS INVESTOR V1: private per-user investor document. Manual records only; no exchange connection, no orders.
// Stored under its own Redis key, never mixed with the Trading Journal (user:{id}:journal).
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";
import { emptyDoc, parseDoc } from "@/lib/investor/model";
import { ledgerIssue } from "@/lib/investor/calc";

export const dynamic = "force-dynamic";

const MAX_BYTES = 500_000;
const key = (userId: string) => `user:${userId}:investor`;
const H = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: H });

async function load(ctx: { userId: string; redis: { get: <T>(k: string) => Promise<T | null> } }) {
  const stored = await ctx.redis.get<unknown>(key(ctx.userId));
  const parsed = stored ? parseDoc(stored) : null;
  return parsed && parsed.ok ? parsed.doc : emptyDoc();
}

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    return json({ doc: await load(ctx) });
  } catch (err) {
    console.error("investor GET failed:", err);
    return json({ error: "Could not load investor data" }, 500);
  }
}

export async function PUT(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const b = body as { baseRevision?: unknown; doc?: unknown } | null;
  if (!b || typeof b.baseRevision !== "number" || !Number.isInteger(b.baseRevision) || b.baseRevision < 0) {
    return json({ error: "Missing baseRevision" }, 400);
  }
  const parsed = parseDoc(b.doc);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  if (JSON.stringify(parsed.doc).length > MAX_BYTES) return json({ error: "Investor data too large" }, 413);
  const issue = ledgerIssue(parsed.doc);
  if (issue) return json({ error: "A sale is larger than the quantity held on that date", issue }, 422);
  try {
    const current = await load(ctx);
    if (current.revision !== b.baseRevision) {
      // Another device or tab saved first: refuse instead of overwriting, and hand back the newer data.
      return json({ error: "Out of date", doc: current }, 409);
    }
    const next = { ...parsed.doc, revision: current.revision + 1 };
    await ctx.redis.set(key(ctx.userId), next);
    return json({ ok: true, doc: next });
  } catch (err) {
    console.error("investor PUT failed:", err);
    return json({ error: "Could not save investor data" }, 500);
  }
}
