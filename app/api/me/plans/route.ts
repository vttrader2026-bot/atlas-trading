import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser, clean } from "@/lib/userStore";
import type { SavedPlan } from "@/lib/savedPlans";
import { getEntitlements } from "@/lib/entitlements";
import { PLAN_ACTIONS, activePlanLimit, addPlan, countActive, isActivePlan, plansKey, setPlanStatus, NO_LIMIT, type PlanAction, type PlansRedis } from "@/lib/tradePlansAtomic";

export const dynamic = "force-dynamic";

const key = plansKey;
const noStore = { "Cache-Control": "no-store" };

/** PHASE-3B: membership could not be confirmed. Never treated as Free; nothing was changed. Safe to retry. */
function membershipUnverified() {
  return NextResponse.json(
    { error: "We could not verify your membership right now. Nothing was changed. Please try again in a moment.", code: "membership_unverified", retryable: true },
    { status: 503, headers: { ...noStore, "Retry-After": "30" } },
  );
}

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const all = await ctx.redis.hgetall<Record<string, SavedPlan>>(key(ctx.userId));
    const plans = Object.values(all ?? {}).sort((a, b) => b.createdAt - a.createdAt);
    // Reading never needs a verified plan: when it is unknown the plans are still shown, without a limit.
    const ent = await getEntitlements(ctx.userId);
    const active = countActive(plans);
    if (ent.status === "unverified") return NextResponse.json({ plans, active, unverified: true }, { headers: noStore });
    return NextResponse.json({ plans, active, limit: activePlanLimit(ent.plan), plan: ent.plan }, { headers: noStore });
  } catch (err) {
    console.error("plans GET failed:", err);
    return NextResponse.json({ error: "Could not load plans" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const dir = b.direction;
  // Spot only: a legacy "Short" is stored as "Wait".
  const direction = dir === "Long" ? "Long" : dir === "Wait" || dir === "Short" ? "Wait" : null;
  const pair = clean(b.pair, 30).toUpperCase();
  if (!pair || !direction) {
    return NextResponse.json({ error: "Pair and direction are required" }, { status: 400 });
  }
  try {
    const plan: SavedPlan = {
      id: randomUUID(),
      createdAt: Date.now(),
      pair,
      direction,
      timeframe: clean(b.timeframe, 20),
      entryZone: clean(b.entryZone, 200),
      invalidationText: clean(b.invalidationText, 200),
      entry: clean(b.entry, 50),
      invalidation: clean(b.invalidation, 50),
      tp1: clean(b.tp1, 50),
      tp2: clean(b.tp2, 50),
      tp3: clean(b.tp3, 50),
      reasoning: clean(b.reasoning, 2000),
      status: b.status === "entered" ? "entered" : "draft",
      balance: clean(b.balance, 50),
      riskPct: clean(b.riskPct, 20),
      enteredAt: clean(b.enteredAt, 20),
      actualEntry: clean(b.actualEntry, 50),
      ...(clean(b.signalId, 80) ? { signalId: clean(b.signalId, 80) } : {}),
    };
    // An ACTIVE plan needs a verified membership (the limit depends on it). A plan saved as already Entered is not active:
    // it is not limited, so it does not need one.
    const grows = isActivePlan(plan);
    const ent = await getEntitlements(ctx.userId);
    const verified = ent.status !== "unverified";
    if (grows && !verified) return membershipUnverified();
    const limit = verified ? activePlanLimit(ent.plan) : NO_LIMIT;
    const result = await addPlan(ctx.redis as unknown as PlansRedis, ctx.userId, plan, limit);
    if (!result.ok) {
      if (result.error === "limit") {
        const all = await ctx.redis.hgetall<Record<string, SavedPlan>>(key(ctx.userId));
        return NextResponse.json({ error: "limit", code: "plan_limit", limit, plan: ent.plan, active: countActive(Object.values(all ?? {})) }, { status: 409, headers: noStore });
      }
      return NextResponse.json({ error: "Plan storage limit reached" }, { status: 400, headers: noStore });
    }
    // The identical active plan was already saved (double click, retry): nothing new is stored and no limit is used.
    return NextResponse.json({ plan: result.plan, ...(result.duplicate ? { duplicate: true } : {}) }, { status: result.duplicate ? 200 : 201, headers: noStore });
  } catch (err) {
    console.error("plans POST failed:", err);
    return NextResponse.json({ error: "Could not save plan" }, { status: 500 });
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
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  try {
    await ctx.redis.hdel(key(ctx.userId), id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("plans DELETE failed:", err);
    return NextResponse.json({ error: "Could not delete plan" }, { status: 500 });
  }
}

/** PHASE-3B: Entered / Archived / Restore. Entering or archiving frees an active slot and is always allowed. */
export async function PATCH(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (typeof body === "object" && body !== null ? body : {}) as { id?: unknown; action?: unknown };
  const action = PLAN_ACTIONS.find((a) => a === b.action) as PlanAction | undefined;
  if (typeof b.id !== "string" || !b.id || !action) {
    return NextResponse.json({ error: "id and action (entered, archived, restore) are required" }, { status: 400 });
  }
  try {
    const growing = action === "restore";
    const ent = await getEntitlements(ctx.userId);
    const verified = ent.status !== "unverified";
    if (growing && !verified) return membershipUnverified();
    const limit = verified ? activePlanLimit(ent.plan) : NO_LIMIT;
    const result = await setPlanStatus(ctx.redis as unknown as PlansRedis, ctx.userId, b.id, action, limit);
    if (!result.ok) {
      if (result.error === "notfound") return NextResponse.json({ error: "Plan not found" }, { status: 404, headers: noStore });
      return NextResponse.json({ error: "limit", code: "plan_limit", limit, plan: ent.plan }, { status: 409, headers: noStore });
    }
    return NextResponse.json({ plan: result.plan, changed: result.changed }, { headers: noStore });
  } catch (err) {
    console.error("plans PATCH failed:", err);
    return NextResponse.json({ error: "Could not update plan" }, { status: 500 });
  }
}
