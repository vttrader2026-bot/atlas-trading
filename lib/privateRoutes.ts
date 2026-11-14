// ACCESS-v1: pages that show a member's own trading data. Enforced server-side in proxy.ts.
export const PRIVATE_PREFIXES = ["/journal", "/investor"] as const;

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// OWNER-ONLY-v1: owner tools. Signed-out visitors go to sign-in; signed-in non-owners get the normal 404 (see proxy.ts and
// app/share/layout.tsx). The owner is decided by lib/adminAuth.ts (OWNER_CLERK_USER_ID), never by anything client-side.
export const OWNER_PREFIXES = ["/share", "/api/studio"] as const;

export function isOwnerPath(pathname: string): boolean {
  return OWNER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Where a logged-out visitor is sent; they return to the page they asked for after signing in. */
export function signInRedirectPath(pathname: string, search = ""): string {
  return `/sign-in?redirect_url=${encodeURIComponent(pathname + search)}`;
}
