// ADMIN-v1: how a Clerk user is shown in the owner dashboard.
import { memberState, type Meta } from "@/lib/membership";
import { effectivePlan } from "@/lib/plan";

export type ClerkUserLike = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  createdAt?: number;
  primaryEmailAddressId?: string | null;
  emailAddresses?: Array<{ id: string; emailAddress: string }>;
  privateMetadata?: unknown;
};

export function memberView(u: ClerkUserLike, now: number) {
  const meta = (u.privateMetadata ?? {}) as Meta;
  const email = u.emailAddresses?.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? "";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "";
  return {
    id: u.id,
    name,
    email,
    createdAt: u.createdAt ?? 0,
    storedPlan: meta.plan === "elite" ? "elite" : "free",
    effectivePlan: effectivePlan(meta, now),
    state: memberState(meta, now),
    eliteUntil: typeof meta.eliteUntil === "number" ? meta.eliteUntil : null,
    suspended: meta.suspended === true,
  };
}
