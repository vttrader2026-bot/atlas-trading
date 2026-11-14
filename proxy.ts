import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { isOwnerPath, isPrivatePath, signInRedirectPath } from "@/lib/privateRoutes";
import { isOwnerId } from "@/lib/adminAuth";

// The site is public except pages that show a member's own trading data (Journal / Dashboard).
// Those are checked here, on the server, before any page code is sent: logged-out visitors are
// redirected to sign-in. Private data APIs live behind /api/me/*, which checks the session itself.
export default clerkMiddleware(async (auth, req) => {
  // Owner-only tools (/share, /api/studio): signed-out -> sign-in; signed-in non-owner -> 404 (rewritten to a path that does not exist).
  if (isOwnerPath(req.nextUrl.pathname)) {
    const { userId } = await auth();
    if (!userId) {
      if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
      return NextResponse.redirect(new URL(signInRedirectPath(req.nextUrl.pathname, req.nextUrl.search), req.url));
    }
    if (!isOwnerId(userId)) return NextResponse.rewrite(new URL("/not-found-owner-only", req.url), { status: 404 });
    return;
  }
  if (!isPrivatePath(req.nextUrl.pathname)) return;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL(signInRedirectPath(req.nextUrl.pathname, req.nextUrl.search), req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
