// OWNER-PUBLISH-v1: lets the browser decide whether to SHOW owner-only buttons. Display only: every owner action is
// re-checked on the server by requireOwner. Never reveals the owner id.
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isOwnerId } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  return NextResponse.json({ owner: isOwnerId(userId) }, { headers: { "Cache-Control": "no-store" } });
}
