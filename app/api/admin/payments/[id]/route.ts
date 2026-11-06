// ADMIN-v1: one payment request (with its proof) and the owner's approve / reject decision.
import { NextResponse } from "next/server";
import { auditLog, needsConfirm, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { approvePayment, rejectPayment } from "@/lib/paymentApproval";
import { getPaymentRequest } from "@/lib/paymentRequests";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  const request = await getPaymentRequest(id);
  if (!request) return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
  return NextResponse.json({ request }, { headers: noStore });
}

export async function POST(req: Request, { params }: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  if (body.action !== "approve" && body.action !== "reject") return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  const denied = needsConfirm(body);
  if (denied) return denied;
  const result = body.action === "approve" ? await approvePayment(id, owner.userId) : await rejectPayment(id, owner.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: noStore });
  await auditLog(getRedis(), owner.userId, `payment.${body.action}`, id, { userId: result.request.userId, until: "until" in result ? result.until ?? null : null });
  const { proof, ...request } = result.request;
  void proof;
  return NextResponse.json({ ok: true, request, kind: "kind" in result ? result.kind : undefined, until: "until" in result ? result.until : undefined }, { headers: noStore });
}
