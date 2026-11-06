import { NextRequest, NextResponse } from "next/server";
import { approvePayment, rejectPayment } from "@/lib/paymentApproval";

/**
 * PATCH: approves or rejects a pending payment request (legacy ADMIN_SECRET route, kept for compatibility;
 * the owner dashboard uses /api/admin/payments). Both go through lib/paymentApproval.ts, so the same rules apply:
 * a request is decided once, an approved ELITE payment gives 30 days (extended from the current end date while
 * the membership is active), and an active Elite member is never downgraded.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const secret = req.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: { status?: "approved" | "rejected" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.status !== "approved" && body.status !== "rejected") {
    return NextResponse.json({ error: 'status must be "approved" or "rejected"' }, { status: 400 });
  }

  const result = body.status === "approved" ? await approvePayment(id, "admin-secret") : await rejectPayment(id, "admin-secret");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ request: result.request });
}
