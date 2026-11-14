import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Noto_Sans_Arabic } from "next/font/google";

import { isOwnerId } from "@/lib/adminAuth";
import { signInRedirectPath } from "@/lib/privateRoutes";

// Arabic font for the Social Media Studio images. The rest of the site has no Arabic web
// font, so it is loaded here - on the Share route only - so exported Arabic
// images look the same on every device instead of depending on system fonts.
const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Social Media Studio - Atlas Trading",
  description: "Atlas owner tool.",
  robots: { index: false, follow: false },
};

// OWNER-ONLY-v1: the Social Media Studio is a private owner tool. Checked on the server (second layer after proxy.ts):
// signed-out visitors are sent to sign-in, any other signed-in user gets the normal 404 page.
export default async function ShareLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect(signInRedirectPath("/share"));
  if (!isOwnerId(userId)) notFound();
  return <div className={notoArabic.variable}>{children}</div>;
}
