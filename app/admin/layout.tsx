// ADMIN-v1: the gate for everything under /admin. Server-side: anyone who is not the owner gets the normal 404 page.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isOwnerId } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!isOwnerId(userId)) notFound();
  return <>{children}</>;
}
