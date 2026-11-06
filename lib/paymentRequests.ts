import { randomUUID } from "crypto";
import { getRedis } from "@/lib/userStore";
import type { PaidPlan } from "@/lib/plan";

export type PaymentStatus = "pending" | "approved" | "rejected";

export type PaymentRequest = {
  id: string;
  userId: string;
  /** Which plan was purchased. Records created before the Analyzer plan existed have no value and mean "elite". */
  plan?: PaidPlan;
  amount: string;
  method: string;
  proof: string;
  telegramUsername?: string;
  status: PaymentStatus;
  createdAt: number;
  updatedAt: number;
  /** ADMIN-v1: who decided it (Clerk user id of the owner, or "admin-secret" for the legacy route). */
  reviewedBy?: string;
  /** ADMIN-v1: for an approved ELITE payment, the membership end date (epoch ms) it resulted in. Absent = no date change. */
  grantedUntil?: number;
};

// Single Redis hash (field = request id) on the same Upstash instance
// every other route already uses — no new storage system.
const KEY = "payments:requests";

/**
 * Stores a pending payment request. This only records it - it does not
 * verify payment or touch the user's Clerk plan. An admin reviews it
 * later, and if approved, manually sets privateMetadata.plan = "elite"
 * (in the Clerk dashboard today, or a future admin tool calling the
 * same update).
 */
export async function createPaymentRequest(input: {
  userId: string;
  plan: PaidPlan;
  amount: string;
  method: string;
  proof: string;
  telegramUsername?: string;
}): Promise<PaymentRequest> {
  const redis = getRedis();
  if (!redis) throw new Error("Upstash is not configured");
  const now = Date.now();
  const request: PaymentRequest = {
    id: randomUUID(),
    userId: input.userId,
    plan: input.plan,
    amount: input.amount,
    method: input.method,
    proof: input.proof,
    telegramUsername: input.telegramUsername,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await redis.hset(KEY, { [request.id]: request });
  return request;
}

export async function getPaymentRequest(id: string): Promise<PaymentRequest | null> {
  const redis = getRedis();
  if (!redis) return null;
  const request = await redis.hget<PaymentRequest>(KEY, id);
  return request ?? null;
}

/** All requests, optionally filtered by status, newest first. */
export async function listPaymentRequests(status?: PaymentStatus): Promise<PaymentRequest[]> {
  const redis = getRedis();
  if (!redis) return [];
  const all = await redis.hgetall<Record<string, PaymentRequest>>(KEY);
  const requests = Object.values(all ?? {});
  const filtered = status ? requests.filter((r) => r.status === status) : requests;
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

/** One user's payment/membership history, newest first — doubles as their Elite history log. */
export async function listPaymentRequestsForUser(userId: string): Promise<PaymentRequest[]> {
  const all = await listPaymentRequests();
  return all.filter((r) => r.userId === userId);
}

export async function updatePaymentRequestStatus(
  id: string,
  status: PaymentStatus,
  extra: Pick<PaymentRequest, "reviewedBy" | "grantedUntil"> = {}
): Promise<PaymentRequest | null> {
  const redis = getRedis();
  if (!redis) return null;
  const existing = await getPaymentRequest(id);
  if (!existing) return null;
  const updated: PaymentRequest = { ...existing, ...extra, status, updatedAt: Date.now() };
  await redis.hset(KEY, { [id]: updated });
  return updated;
}
