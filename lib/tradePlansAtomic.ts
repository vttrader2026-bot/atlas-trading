// PHASE-3B: server-saved Trade Plans with limits. `user:{id}:plans` is the SAME hash as before (id -> plan JSON), so existing
// plans need no migration. A plan is ACTIVE unless its status is "entered" or "archived" (old plans have "draft" or none,
// so they are active). Local browser drafts are never sent here and never count.
//
// Every write that could GROW the active count is one Lua script, so two requests can never both pass the same check:
// the script counts the active plans, refuses past the limit, refuses a duplicate, and writes, all in one step.
// Removing, entering and archiving never grow the count, so they are always allowed (an over-limit member can manage).
import { limitFor } from "@/lib/entitlementRules";
import type { SavedPlan } from "@/lib/savedPlans";

export const plansKey = (userId: string) => `user:${userId}:plans`;
/** Safety cap on everything stored per member (active + entered + archived). Not a membership limit. */
export const MAX_STORED_PLANS = 500;
export const NO_LIMIT = 1_000_000;

export const activePlanLimit = (plan: string | null | undefined): number => limitFor(plan, "activeTradePlans");

export const isActivePlan = (p: { status?: unknown }): boolean => p.status !== "entered" && p.status !== "archived";
export const countActive = (plans: readonly { status?: unknown }[]): number => plans.filter(isActivePlan).length;

const FP_FIELDS = ["pair", "direction", "timeframe", "entryZone", "invalidationText", "entry", "invalidation", "tp1", "tp2", "tp3", "signalId"] as const;
/** What makes two saves "the same plan": the setup itself (not the notes). The Lua script builds the identical string. */
export const planFingerprint = (p: Partial<Record<(typeof FP_FIELDS)[number], unknown>>): string => FP_FIELDS.map((k) => String(p[k] ?? "")).join("|");

/**
 * KEYS[1] plans hash. ARGV: 1 plan id, 2 plan JSON, 3 active limit, 4 max stored, 5 "1" when the new plan is active,
 * 6 fingerprint. Returns "1" written, "-1" active limit reached, "-2" storage cap, "dup:<id>" an identical ACTIVE plan exists.
 */
export const PLAN_ADD_SCRIPT = `
local all = redis.call('HGETALL', KEYS[1])
local newActive = ARGV[5] == '1'
local active, total, dup = 0, 0, nil
for i = 1, #all, 2 do
  total = total + 1
  local isActive = true
  local ok, d = pcall(cjson.decode, all[i + 1])
  if ok and type(d) == 'table' then
    if d.status == 'entered' or d.status == 'archived' then isActive = false end
    if isActive and newActive and not dup then
      local fp = tostring(d.pair or '') .. '|' .. tostring(d.direction or '') .. '|' .. tostring(d.timeframe or '') .. '|' .. tostring(d.entryZone or '') .. '|' .. tostring(d.invalidationText or '') .. '|' .. tostring(d.entry or '') .. '|' .. tostring(d.invalidation or '') .. '|' .. tostring(d.tp1 or '') .. '|' .. tostring(d.tp2 or '') .. '|' .. tostring(d.tp3 or '') .. '|' .. tostring(d.signalId or '')
      if fp == ARGV[6] then dup = all[i] end
    end
  end
  if isActive then active = active + 1 end
end
if dup then return 'dup:' .. dup end
if total >= tonumber(ARGV[4]) then return '-2' end
if newActive and active >= tonumber(ARGV[3]) then return '-1' end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return '1'
`;

/**
 * KEYS[1] plans hash. ARGV: 1 plan id, 2 new plan JSON, 3 "1" when the new status is ACTIVE, 4 active limit.
 * Returns "1" written, "0" plan not found, "-1" would exceed the active limit (only when the plan was not active before).
 */
export const PLAN_STATUS_SCRIPT = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return '0' end
if ARGV[3] == '1' then
  local wasActive = true
  local ok, d = pcall(cjson.decode, raw)
  if ok and type(d) == 'table' and (d.status == 'entered' or d.status == 'archived') then wasActive = false end
  if not wasActive then
    local all = redis.call('HVALS', KEYS[1])
    local active = 0
    for i = 1, #all do
      local ok2, e = pcall(cjson.decode, all[i])
      if not (ok2 and type(e) == 'table' and (e.status == 'entered' or e.status == 'archived')) then active = active + 1 end
    end
    if active >= tonumber(ARGV[4]) then return '-1' end
  end
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return '1'
`;

export type PlansRedis = {
  hget: <T = unknown>(key: string, field: string) => Promise<T | null>;
  eval: (script: string, keys: string[], args: string[]) => Promise<unknown>;
};

export type AddResult = { ok: true; plan: SavedPlan; duplicate: boolean } | { ok: false; error: "limit" | "storage" };

/** Saves a new plan. `limit` must come from a verified membership (callers answer 503 before this when it is unknown). */
export async function addPlan(redis: PlansRedis, userId: string, plan: SavedPlan, limit: number): Promise<AddResult> {
  const active = isActivePlan(plan);
  const code = String(await redis.eval(PLAN_ADD_SCRIPT, [plansKey(userId)], [plan.id, JSON.stringify(plan), String(active ? limit : NO_LIMIT), String(MAX_STORED_PLANS), active ? "1" : "0", planFingerprint(plan)]));
  if (code === "1") return { ok: true, plan, duplicate: false };
  if (code === "-1") return { ok: false, error: "limit" };
  if (code === "-2") return { ok: false, error: "storage" };
  if (code.startsWith("dup:")) {
    const existing = await redis.hget<SavedPlan>(plansKey(userId), code.slice(4));
    return { ok: true, plan: existing ?? plan, duplicate: true };
  }
  return { ok: false, error: "storage" };
}

export type PlanAction = "entered" | "archived" | "restore";
export const PLAN_ACTIONS: readonly PlanAction[] = ["entered", "archived", "restore"];

export type StatusResult = { ok: true; plan: SavedPlan; changed: boolean } | { ok: false; error: "notfound" | "limit" };

/** Entered / Archived never grow the active count and are always allowed. Restore makes a plan active again, so it is limited. */
export async function setPlanStatus(redis: PlansRedis, userId: string, id: string, action: PlanAction, limit: number, now = Date.now()): Promise<StatusResult> {
  const current = await redis.hget<SavedPlan>(plansKey(userId), id);
  if (!current || typeof current !== "object") return { ok: false, error: "notfound" };
  const target = action === "restore" ? "draft" : action;
  const same = action === "restore" ? isActivePlan(current) : current.status === target;
  if (same) return { ok: true, plan: current, changed: false };
  const next: SavedPlan = { ...current, status: target };
  if (action === "entered" && !next.enteredAt) next.enteredAt = new Date(now).toISOString().slice(0, 10);
  if (action === "archived") (next as SavedPlan & { archivedAt?: number }).archivedAt = now;
  const code = String(await redis.eval(PLAN_STATUS_SCRIPT, [plansKey(userId)], [id, JSON.stringify(next), action === "restore" ? "1" : "0", String(limit)]));
  if (code === "1") return { ok: true, plan: next, changed: true };
  if (code === "-1") return { ok: false, error: "limit" };
  return { ok: false, error: "notfound" };
}
