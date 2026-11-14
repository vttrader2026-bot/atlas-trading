// ENTITLEMENTS-v2: short-lived server-side cache of CLERK-VERIFIED membership, in Redis at `entitlement:v1:{userId}`.
//
// Purpose: (1) skip repeat Clerk lookups for 60 s, (2) keep a paying ELITE member on ELITE for up to 24 h if Clerk is
// unreachable, instead of silently treating them as Free.
//
// Safety rules (each is tested):
//  - Only lib/entitlements.ts writes here, and only with values it just read from Clerk on the server. The key comes from
//    the verified session user id. No request header, cookie, body or localStorage value ever reaches this module.
//  - The record holds only { v, plan, eliteUntil, suspended, verifiedAt }. Access (expiry, suspension) is recomputed
//    from it with the CURRENT time on every read; a cached Free record can never produce ELITE.
//  - Every read is schema-validated; anything malformed is ignored.
//  - Redis errors never throw: a failed read is a miss, a failed write is skipped, a failed invalidation is reported.
//  - Writes are atomic compare-and-set scripts: an older verification can never overwrite a newer one, and a read that
//    STARTED before an invalidation can never repopulate the cache afterwards (invalidation leaves a short tombstone).
import { getRedis } from "@/lib/redis";
import { ENTITLEMENT_STALE_GRACE_MS } from "@/lib/entitlementConfig";
import type { VerifiedRecord } from "@/lib/entitlementRules";

export const entitlementKey = (userId: string): string => `entitlement:v1:${userId}`;
export const invalidationKey = (userId: string): string => `entitlement:v1:${userId}:inv`;

/** Records are kept a little beyond the grace window so the age check, not Redis expiry, decides. Free records are not worth keeping. */
const ELITE_TTL_SEC = Math.ceil(ENTITLEMENT_STALE_GRACE_MS / 1000) + 300;
const FREE_TTL_SEC = 120;
/** How long an invalidation tombstone blocks older in-flight reads from being cached (must outlast a slow Clerk request). */
export const TOMBSTONE_TTL_SEC = 300;
/** Server clocks may differ slightly: a read that started within this window after an invalidation is not cached either. */
export const CLOCK_SKEW_MS = 5_000;

/**
 * KEYS[1]=record KEYS[2]=tombstone  ARGV[1]=json ARGV[2]=verifiedAt(ms) ARGV[3]=ttl(s) ARGV[4]=skew(ms)
 * Refuses (returns 0) when the verification started before/at the last invalidation, or when a newer record is stored.
 */
export const WRITE_SCRIPT = `
local inv = redis.call('GET', KEYS[2])
if inv and tonumber(inv) and tonumber(ARGV[2]) <= tonumber(inv) + tonumber(ARGV[4]) then return 0 end
local cur = redis.call('GET', KEYS[1])
if cur then
  local ok, rec = pcall(cjson.decode, cur)
  if ok and type(rec) == 'table' and tonumber(rec.verifiedAt) and tonumber(rec.verifiedAt) > tonumber(ARGV[2]) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
return 1
`;

/** KEYS[1]=record KEYS[2]=tombstone  ARGV[1]=now(ms) ARGV[2]=ttl(s). Deletes the record and records when (never moves the tombstone backwards). */
export const INVALIDATE_SCRIPT = `
local inv = redis.call('GET', KEYS[2])
if not (inv and tonumber(inv) and tonumber(inv) >= tonumber(ARGV[1])) then
  redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
end
redis.call('DEL', KEYS[1])
return 1
`;

/** Strict validation of whatever Redis returned (an object, or a JSON string). Null when it is not exactly a VerifiedRecord. */
export function parseRecord(raw: unknown): VerifiedRecord | null {
  let v: unknown = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const keys = Object.keys(r).sort().join(",");
  if (keys !== "eliteUntil,plan,suspended,v,verifiedAt") return null;
  if (r.v !== 1) return null;
  if (r.plan !== "free" && r.plan !== "elite") return null;
  if (typeof r.suspended !== "boolean") return null;
  if (r.eliteUntil !== null && (typeof r.eliteUntil !== "number" || !Number.isFinite(r.eliteUntil))) return null;
  if (typeof r.verifiedAt !== "number" || !Number.isFinite(r.verifiedAt) || r.verifiedAt <= 0) return null;
  return { v: 1, plan: r.plan, eliteUntil: r.eliteUntil as number | null, suspended: r.suspended, verifiedAt: r.verifiedAt };
}

/** The cached record, or null on a miss, a malformed record, no Redis, or any Redis error. Never throws. */
export async function readEntitlementRecord(userId: string): Promise<VerifiedRecord | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return parseRecord(await redis.get(entitlementKey(userId)));
  } catch (err) {
    console.error("entitlements: cache read failed (treated as a miss)", err);
    return null;
  }
}

/**
 * Stores a record that Clerk just verified. `record.verifiedAt` must be the time the Clerk read STARTED. Returns true when
 * stored, false when refused (a newer record or an invalidation wins) or when Redis failed. Never throws.
 */
export async function writeVerifiedEntitlement(userId: string, record: VerifiedRecord): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const ttl = record.plan === "elite" ? ELITE_TTL_SEC : FREE_TTL_SEC;
    const res = await redis.eval(WRITE_SCRIPT, [entitlementKey(userId), invalidationKey(userId)], [JSON.stringify(record), String(record.verifiedAt), String(ttl), String(CLOCK_SKEW_MS)]);
    return Number(res) === 1;
  } catch (err) {
    console.error("entitlements: cache write failed (skipped)", err);
    return false;
  }
}

/**
 * Forgets a member's cached membership. Call it AFTER a successful Clerk write that changes their plan, expiry or
 * suspension, never before. Retries once. Returns true when the cache is cleared.
 *
 * If it returns false the stale record can only matter in two ways, both bounded:
 *  - for up to 60 s after it was verified, a normal request may still see the old membership;
 *  - if Clerk is ALSO unreachable, an old ELITE record may keep ELITE for at most 24 h after it was verified.
 * It can never make a member worse off than Clerk says once Clerk is reachable again: the next successful Clerk read
 * overwrites it. Failures are logged loudly so they can be acted on.
 */
export async function invalidateEntitlements(userId: string): Promise<boolean> {
  if (!userId) return false;
  const redis = getRedis();
  if (!redis) return false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await redis.eval(INVALIDATE_SCRIPT, [entitlementKey(userId), invalidationKey(userId)], [String(Date.now()), String(TOMBSTONE_TTL_SEC)]);
      return true;
    } catch (err) {
      console.error(`entitlements: cache invalidation failed (attempt ${attempt} of 2) for ${userId}`, err);
    }
  }
  console.error(`entitlements: ENTITLEMENT CACHE NOT CLEARED for ${userId}; the old record expires on its own (60 s fresh window; ELITE grace is bounded to 24 h)`);
  return false;
}
