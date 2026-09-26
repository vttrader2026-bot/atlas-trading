import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listPaymentRequestsForUser } from "@/lib/paymentRequests";

/**
 * GET: the signed-in user's own most recent payment request status.
 * Powers the Pending -> Approved/Rejected indicator on the Elite page.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requests = await listPaymentRequestsForUser(userId);
  const latest = requests[0] ?? null;

  return NextResponse.json({ request: latest });
}
