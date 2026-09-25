import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createPaymentRequest, listPaymentRequests, type PaymentStatus } from "@/lib/paymentRequests";
import { notifyAdmin } from "@/lib/telegram";

const MAX_PROOF_BYTES = 4 * 1024 * 1024; // ~4MB base64 payload ceiling, kept well under typical Redis/request limits

/**
 * POST: any signed-in user submits a payment request for Elite.
 * Records it as "pending" and pings the admin on Telegram - it does NOT
 * touch the user's plan. Approval is a separate, manual admin action.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { amount?: string; method?: string; proof?: string; telegramUsername?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { amount, method, proof, telegramUsername } = body;
  if (!amount || !method || !proof) {
    return NextResponse.json({ error: "amount, method, and proof are required" }, { status: 400 });
  }
  if (proof.length > MAX_PROOF_BYTES) {
    return NextResponse.json({ error: "Screenshot is too large. Please upload a smaller image." }, { status: 400 });
  }

  const request = await createPaymentRequest({
    userId,
    amount,
    method,
    proof,
    telegramUsername,
  });

  // Best-effort - a failed notification should never fail the submission
  // itself, since the request is already safely recorded in Redis.
  await notifyAdmin(
    `💳 <b>New Atlas Elite payment request</b>\n` +
      `Method: ${escapeHtml(method)}\n` +
      `Amount: ${escapeHtml(amount)}\n` +
      `Telegram: ${escapeHtml(telegramUsername || "not provided")}\n` +
      `Request ID: <code>${request.id}</code>\n` +
      `Review it in the admin panel.`
  );

  return NextResponse.json({ id: request.id, status: request.status });
}

/**
 * GET: admin-only listing of payment requests, optionally filtered by
 * status (?status=pending). Authenticated via the same shared admin
 * secret pattern already used elsewhere in this app (e.g. trade-feed
 * publishing) - sent as a header, not a query param, so it doesn't end
 * up in server logs or browser history.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const statusParam = req.nextUrl.searchParams.get("status") as PaymentStatus | null;
  const requests = await listPaymentRequests(statusParam ?? undefined);
  return NextResponse.json({ requests });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
