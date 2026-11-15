// ATLAS INVESTOR V1: private per-user investor document. Manual records only; no exchange connection, no orders.
// Stored under its own Redis key, never mixed with the Trading Journal (user:{id}:journal).
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";
import { emptyDoc, parseDoc } from "@/lib/investor/model";
import { ledgerIssue } from "@/lib/investor/calc";
import { activePlanCount } from "@/lib/investor/dca";
import { investorKey, writeInvestor, type InvestorRedis } from "@/lib/investor/atomic";
import { getEntitlements } from "@/lib/entitlements";
import { limitFor } from "@/lib/entitlementRules";

export const dynamic = "force-dynamic";

const MAX_BYTES = 500_000;
const key = investorKey;
const H = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: H });

async function load(ctx: { userId: string; redis: { get: <T>(k: string) => Promise<T | null> } }) {
  const stored = await ctx.redis.get<unknown>(key(ctx.userId));
  const parsed = stored ? parseDoc(stored) : null;
  return parsed && parsed.ok ? parsed.doc : emptyDoc();
}

/** PHASE-3C: the active-DCA-plan count and limit, for the screen. `limit` is omitted when membership cannot be verified. */
async function dcaInfo(userId: string, doc: ReturnType<typeof emptyDoc>) {
  const active = activePlanCount(doc);
  try {
    const ent = await getEntitlements(userId);
    return ent.status === "unverified" ? { active, unverified: true } : { active, limit: limitFor(ent.plan, "activeDcaPlans"), plan: ent.plan };
  } catch {
    return { active, unverified: true };
  }
}

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const doc = await load(ctx);
    return json({ doc, dca: await dcaInfo(ctx.userId, doc) });
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
    // PHASE-3C: a save that RAISES the number of active DCA plans (new plan, Restore, or deleting a purchase that had completed a
    // plan) needs a verified membership and room under the limit. Saves that do not raise it (closing, deleting, buying, selling,
    // editing) are never blocked, so an over-limit member can still manage everything.
    const before = activePlanCount(current);
    const after = activePlanCount(parsed.doc);
    if (after > before) {
      const ent = await getEntitlements(ctx.userId);
      if (ent.status === "unverified") {
        return NextResponse.json(
          { error: "We could not verify your membership right now. Nothing was saved. Please try again in a moment.", code: "membership_unverified", retryable: true },
          { status: 503, headers: { ...H, "Retry-After": "30" } },
        );
      }
      const limit = limitFor(ent.plan, "activeDcaPlans");
      if (after > limit) return json({ error: "limit", code: "dca_limit", limit, plan: ent.plan, active: before }, 409);
    }
    const next = { ...parsed.doc, revision: current.revision + 1 };
    // One atomic step: if anyone saved after we read, nothing is written and the newer data is handed back.
    if (!(await writeInvestor(ctx.redis as unknown as InvestorRedis, ctx.userId, next, current.revision))) {
      return json({ error: "Out of date", doc: await load(ctx) }, 409);
    }
    return json({ ok: true, doc: next, dca: { active: after } });
  } catch (err) {
    console.error("investor PUT failed:", err);
    return json({ error: "Could not save investor data" }, 500);
  }
}
