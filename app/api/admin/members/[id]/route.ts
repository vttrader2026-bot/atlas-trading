// ADMIN-v1: one member (with payment history) and the owner's membership actions.
import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { auditLog, needsConfirm, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { memberView, type ClerkUserLike } from "@/lib/adminMembers";
import { MEMBER_ACTIONS, planMemberAction, type MemberAction, type Meta } from "@/lib/membership";
import { listPaymentRequestsForUser } from "@/lib/paymentRequests";
import { invalidateEntitlements } from "@/lib/entitlementCache";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const ERRORS: Record<string, string> = {
  alreadyActive: "This member already has an active ELITE membership. Use Renew.",
  alreadySuspended: "This member is suspended. Unsuspend first.",
  notElite: "This member is not on ELITE.",
  noExpiry: "This member has no expiry date yet. Assign one with Set expiry.",
  badDays: "Days must be a whole number from 1 to 366.",
  badDate: "Choose a future expiry date (within 10 years).",
  notSuspended: "This member is not suspended.",
  nothingToSuspend: "Only paid members can be suspended.",
  alreadyFree: "This member has no paid plan.",
};

export async function GET(req: Request, { params }: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(id);
    // The proof screenshot is large and not needed in a list.
    const payments = (await listPaymentRequestsForUser(id)).map(({ proof, ...rest }) => ({ ...rest, hasProof: !!proof }));
    return NextResponse.json({ member: memberView(user as unknown as ClerkUserLike, Date.now()), payments }, { headers: noStore });
  } catch (err) {
    console.error("admin/members GET one failed", err);
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const action = body.action as MemberAction;
  if (!MEMBER_ACTIONS.includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const denied = needsConfirm(body);
  if (denied) return denied;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(id);
    const now = Date.now();
    const plan = planMemberAction((user.privateMetadata ?? {}) as Meta, action, { days: body.days, until: body.until }, now);
    if (!plan.ok) return NextResponse.json({ error: ERRORS[plan.error] ?? "Not allowed" }, { status: 409 });
    const updated = await client.users.updateUserMetadata(id, { privateMetadata: plan.patch });
    // Only after the Clerk write succeeded (renew, activate, suspend, revoke, set expiry...): drop the cached membership.
    const cacheCleared = await invalidateEntitlements(id);
    await auditLog(getRedis(), owner.userId, `member.${action}`, id, { patch: plan.patch, ...(cacheCleared ? {} : { entitlementCache: "not-cleared" }) });
    return NextResponse.json({ ok: true, member: memberView(updated as unknown as ClerkUserLike, now) }, { headers: noStore });
  } catch (err) {
    console.error("admin/members action failed", err);
    return NextResponse.json({ error: "Could not update the member" }, { status: 500 });
  }
}
