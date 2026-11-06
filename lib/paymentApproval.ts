// ADMIN-v1: the one place a payment request is approved or rejected (the owner dashboard and the legacy
// ADMIN_SECRET route both call it).  A request can be decided ONCE: only "pending" can change.
import { clerkClient } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/userStore";
import { getPaymentRequest, updatePaymentRequestStatus, type PaymentRequest } from "@/lib/paymentRequests";
import { planAnalyzerApproval, planEliteApproval, type Meta } from "@/lib/membership";

export type DecisionResult =
  | { ok: true; request: PaymentRequest; kind?: "started" | "extended" | "unlimited" | "analyzer" | "unchanged"; until?: number | null }
  | { ok: false; status: number; error: string; request?: PaymentRequest };

const lockKey = (id: string) => `payments:decision-lock:${id}`;

async function claim(id: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    return !!(await redis.set(lockKey(id), "1", { nx: true, ex: 60 }));
  } catch {
    return false;
  }
}

export async function approvePayment(id: string, reviewer: string, now: number = Date.now()): Promise<DecisionResult> {
  const existing = await getPaymentRequest(id);
  if (!existing) return { ok: false, status: 404, error: "Payment request not found" };
  if (existing.status !== "pending") return { ok: false, status: 409, error: `Already ${existing.status}` };
  if (!(await claim(id))) return { ok: false, status: 409, error: "This request is already being processed" };

  let kind: "started" | "extended" | "unlimited" | "analyzer" | "unchanged";
  let until: number | null = null;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(existing.userId);
    const meta = (user.privateMetadata ?? {}) as Meta;
    const target = existing.plan ?? "elite"; // requests from before the Analyzer plan were all Elite
    if (target === "elite") {
      const p = planEliteApproval(meta, now);
      kind = p.kind;
      until = p.until;
      if (p.patch) await client.users.updateUserMetadata(existing.userId, { privateMetadata: p.patch });
    } else {
      const patch = planAnalyzerApproval(meta);
      kind = patch ? "analyzer" : "unchanged";
      if (patch) await client.users.updateUserMetadata(existing.userId, { privateMetadata: patch });
    }
  } catch (err) {
    // Nothing was recorded as approved: the request stays pending and can be retried.
    console.error("payments: could not update the member's plan", err);
    return { ok: false, status: 500, error: "Could not update the member's plan. The request is still pending, try again." };
  }
  const updated = await updatePaymentRequestStatus(id, "approved", { reviewedBy: reviewer, ...(until ? { grantedUntil: until } : {}) });
  if (!updated) return { ok: false, status: 500, error: "The plan was updated but the request could not be marked approved. Check it in Payment history." };
  return { ok: true, request: updated, kind, until };
}

export async function rejectPayment(id: string, reviewer: string): Promise<DecisionResult> {
  const existing = await getPaymentRequest(id);
  if (!existing) return { ok: false, status: 404, error: "Payment request not found" };
  if (existing.status !== "pending") return { ok: false, status: 409, error: `Already ${existing.status}` };
  if (!(await claim(id))) return { ok: false, status: 409, error: "This request is already being processed" };
  const updated = await updatePaymentRequestStatus(id, "rejected", { reviewedBy: reviewer });
  if (!updated) return { ok: false, status: 500, error: "Could not record the rejection" };
  return { ok: true, request: updated };
}
