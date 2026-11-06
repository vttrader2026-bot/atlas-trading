// ADMIN-v1: owner-only payment list (all statuses = payment history). Proof screenshots are fetched per request.
import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { noStore, requireOwner } from "@/lib/adminAuth";
import { listPaymentRequests, type PaymentStatus } from "@/lib/paymentRequests";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const s = new URL(req.url).searchParams.get("status");
  const status = s === "pending" || s === "approved" || s === "rejected" ? (s as PaymentStatus) : undefined;
  try {
    const list = await listPaymentRequests(status);
    const names = new Map<string, string>();
    try {
      const ids = [...new Set(list.slice(0, 200).map((r) => r.userId))];
      if (ids.length) {
        const client = await clerkClient();
        const res = await client.users.getUserList({ userId: ids, limit: 100 });
        for (const u of res.data) names.set(u.id, u.emailAddresses?.[0]?.emailAddress ?? [u.firstName, u.lastName].filter(Boolean).join(" "));
      }
    } catch (err) {
      console.error("admin/payments: could not resolve member names", err);
    }
    const requests = list.slice(0, 200).map(({ proof, ...r }) => ({ ...r, hasProof: !!proof, member: names.get(r.userId) ?? "" }));
    return NextResponse.json({ requests, total: list.length }, { headers: noStore });
  } catch (err) {
    console.error("admin/payments GET failed", err);
    return NextResponse.json({ error: "Could not load payments" }, { status: 500 });
  }
}
