// ADMIN-v1: pure membership rules (no I/O). One place decides how an ELITE membership starts, extends, expires,
// is suspended or ends, so the admin dashboard and the payment approval cannot disagree.
import { effectivePlan } from "@/lib/plan";

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Every approved monthly ELITE payment gives this many days. */
export const ELITE_PAYMENT_DAYS = 30;
export const MAX_GRANT_DAYS = 366;

export type Meta = Record<string, unknown>;
/** Values to merge into Clerk privateMetadata. `null` removes the key. */
export type MetaPatch = Record<string, unknown>;

const validUntil = (meta: Meta | null | undefined): number | null => {
  const u = meta?.eliteUntil;
  return typeof u === "number" && Number.isFinite(u) ? u : null;
};
const hasNoExpiry = (meta: Meta | null | undefined) => meta?.plan === "elite" && (meta.eliteUntil === undefined || meta.eliteUntil === null);

/** ELITE kept from before expiry existed: no end date until the owner assigns one. */
export const isUnlimitedElite = hasNoExpiry;

export type MemberState = "free" | "active" | "unlimited" | "expired" | "suspended";

/** What the dashboard shows for a member. */
export function memberState(meta: Meta | null | undefined, now: number): MemberState {
  const plan = meta?.plan;
  if (plan !== "elite") return "free";
  if (meta?.suspended === true) return "suspended";
  if (hasNoExpiry(meta)) return "unlimited";
  return effectivePlan(meta, now) === "elite" ? "active" : "expired";
}

/** Start date for extending: the current end date while the membership is still running, otherwise `now`. */
export function extensionBase(meta: Meta | null | undefined, now: number): number {
  const until = validUntil(meta);
  return meta?.plan === "elite" && until !== null && until > now ? until : now;
}

export type ApprovalPlan = { kind: "started" | "extended" | "unlimited"; patch: MetaPatch | null; until: number | null };

/**
 * An approved ELITE payment. Never shortens or downgrades:
 *  - an ELITE member with no end date stays as is (no patch);
 *  - an active member is extended from the CURRENT end date;
 *  - an expired / free / analyzer account starts from `now`.
 * A suspension flag is left untouched (the owner lifts it explicitly).
 */
export function planEliteApproval(meta: Meta | null | undefined, now: number, days: number = ELITE_PAYMENT_DAYS): ApprovalPlan {
  if (hasNoExpiry(meta)) return { kind: "unlimited", patch: null, until: null };
  const base = extensionBase(meta, now);
  const until = base + days * DAY_MS;
  return { kind: base > now ? "extended" : "started", patch: { plan: "elite", eliteUntil: until }, until };
}

export type MemberAction = "activate" | "renew" | "setExpiry" | "suspend" | "unsuspend" | "revoke";
export const MEMBER_ACTIONS: readonly MemberAction[] = ["activate", "renew", "setExpiry", "suspend", "unsuspend", "revoke"];
export type ActionError = "alreadyActive" | "notElite" | "noExpiry" | "badDays" | "badDate" | "notSuspended" | "alreadySuspended" | "nothingToSuspend" | "alreadyFree";
export type ActionResult = { ok: true; patch: MetaPatch } | { ok: false; error: ActionError };

const goodDays = (d: unknown): d is number => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= MAX_GRANT_DAYS;

export function planMemberAction(meta: Meta | null | undefined, action: MemberAction, input: { days?: unknown; until?: unknown }, now: number): ActionResult {
  const days = input.days === undefined ? ELITE_PAYMENT_DAYS : input.days;
  switch (action) {
    case "activate": {
      if (!goodDays(days)) return { ok: false, error: "badDays" };
      if (meta?.plan === "elite" && effectivePlan(meta, now) === "elite") return { ok: false, error: "alreadyActive" };
      if (meta?.plan === "elite" && meta.suspended === true && (hasNoExpiry(meta) || (validUntil(meta) ?? 0) > now)) return { ok: false, error: "alreadySuspended" };
      return { ok: true, patch: { plan: "elite", eliteUntil: now + days * DAY_MS, suspended: null } };
    }
    case "renew": {
      if (!goodDays(days)) return { ok: false, error: "badDays" };
      if (meta?.plan !== "elite") return { ok: false, error: "notElite" };
      if (hasNoExpiry(meta)) return { ok: false, error: "noExpiry" };
      return { ok: true, patch: { plan: "elite", eliteUntil: extensionBase(meta, now) + days * DAY_MS } };
    }
    case "setExpiry": {
      if (meta?.plan !== "elite") return { ok: false, error: "notElite" };
      const until = input.until;
      if (typeof until !== "number" || !Number.isFinite(until) || until <= now || until > now + 10 * 366 * DAY_MS) return { ok: false, error: "badDate" };
      return { ok: true, patch: { eliteUntil: until } };
    }
    case "suspend": {
      if (meta?.plan !== "elite") return { ok: false, error: "nothingToSuspend" };
      if (meta.suspended === true) return { ok: false, error: "alreadySuspended" };
      return { ok: true, patch: { suspended: true } };
    }
    case "unsuspend": {
      if (meta?.suspended !== true) return { ok: false, error: "notSuspended" };
      return { ok: true, patch: { suspended: null } };
    }
    case "revoke": {
      if (meta?.plan !== "elite") return { ok: false, error: "alreadyFree" };
      return { ok: true, patch: { plan: null, eliteUntil: null, suspended: null } };
    }
  }
}
