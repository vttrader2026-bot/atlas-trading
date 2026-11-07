// ACCESS-v1: pages that show a member's own trading data. Enforced server-side in proxy.ts.
export const PRIVATE_PREFIXES = ["/journal"] as const;

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Where a logged-out visitor is sent; they return to the page they asked for after signing in. */
export function signInRedirectPath(pathname: string, search = ""): string {
  return `/sign-in?redirect_url=${encodeURIComponent(pathname + search)}`;
}
