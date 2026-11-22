// USERNAME-v1: helpers for accounts created with a username and no email.
type EmailLike = { verification?: { status?: string | null } | null };
type UserLike = { emailAddresses?: EmailLike[] | null } | null | undefined;

/** True when the account has at least one verified email (needed for password recovery). */
export function hasVerifiedEmail(user: UserLike): boolean {
  return !!user?.emailAddresses?.some((e) => e?.verification?.status === "verified");
}

/** Show the add-email reminder only to signed-in users without a verified email, off the auth pages. */
export function shouldShowEmailNotice(user: UserLike, signedIn: boolean, pathname: string | null): boolean {
  if (!signedIn || !user) return false;
  if (pathname && (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up"))) return false;
  return !hasVerifiedEmail(user);
}

/** Best label for a member: email, then name, then username, then id. */
export function memberLabel(m: { email?: string | null; name?: string | null; username?: string | null; id: string }): string {
  return m.email || m.name || m.username || m.id;
}
