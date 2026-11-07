import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { isPrivatePath, signInRedirectPath } from "@/lib/privateRoutes";

// The site is public except pages that show a member's own trading data (Journal / Dashboard).
// Those are checked here, on the server, before any page code is sent: logged-out visitors are
// redirected to sign-in. Private data APIs live behind /api/me/*, which checks the session itself.
export default clerkMiddleware(async (auth, req) => {
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
