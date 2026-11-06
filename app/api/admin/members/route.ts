// ADMIN-v1: owner-only member list (Clerk users with their plan, expiry and suspension).
import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { noStore, requireOwner } from "@/lib/adminAuth";
import { memberView, type ClerkUserLike } from "@/lib/adminMembers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  try {
    const client = await clerkClient();
    const res = await client.users.getUserList({ query: q || undefined, limit, offset, orderBy: "-created_at" });
    const now = Date.now();
    return NextResponse.json({ members: res.data.map((u) => memberView(u as unknown as ClerkUserLike, now)), total: res.totalCount }, { headers: noStore });
  } catch (err) {
    console.error("admin/members GET failed", err);
    return NextResponse.json({ error: "Could not load members" }, { status: 500 });
  }
}
