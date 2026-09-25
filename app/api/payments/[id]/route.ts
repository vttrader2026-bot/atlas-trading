import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getPaymentRequest, updatePaymentRequestStatus } from "@/lib/paymentRequests";

/**
 * PATCH: admin approves or rejects a pending payment request.
 *
 * Approval is the ONLY place a user's plan flips from free to elite in
 * this flow - it is always a manual admin action gated behind the shared
 * admin secret, never automatic from the screenshot upload itself.
 * Rejection just records the outcome; the user stays on Free.
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

  const existing = await getPaymentRequest(id);
  if (!existing) {
    return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
  }

  const updated = await updatePaymentRequestStatus(id, body.status);

  if (body.status === "approved") {
    try {
      const client = await clerkClient();
      await client.users.updateUserMetadata(existing.userId, {
        privateMetadata: { plan: "elite" },
      });
    } catch (err) {
      // The payment request is already marked approved at this point, but
      // the plan flip failed - surface this clearly rather than silently
      // leaving someone paid-but-still-Free.
      console.error("payments: approved request but failed to set Clerk plan to elite", err);
      return NextResponse.json(
        { error: "Marked approved, but failed to update the user's plan. Set it manually in Clerk.", request: updated },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ request: updated });
}
