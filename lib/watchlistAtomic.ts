// PHASE-3A: atomic Watchlist writes. Every change (add, remove, merge, seen) is a compare-and-set on a revision counter, so
// two requests can never both write from the same snapshot: the loser re-reads and re-applies. The same Lua script also
// re-checks the limit against the value it is replacing, so a limit can never be exceeded even if the JS side were wrong.
//
// What is stored is unchanged: `user:{id}:watchlist` holds the same JSON state the old route wrote with SET. A new key
// `user:{id}:watchlist:rev` holds the revision (missing = 0), so existing lists need no migration.
import { applyOp, normalizeState, type WatchOp, type WatchState } from "@/lib/watchlist";

export const watchlistKey = (userId: string) => `user:${userId}:watchlist`;
export const watchlistRevKey = (userId: string) => `user:${userId}:watchlist:rev`;

/**
 * KEYS[1] state, KEYS[2] revision. ARGV[1] expected revision, ARGV[2] new state (JSON), ARGV[3] max items.
 * Returns 1 written, 0 revision changed (retry), -1 would exceed the limit while adding, -2 invalid payload.
 * A write that does not grow the list is always allowed, so an over-limit (downgraded) list can still be reduced.
 */
export const WATCHLIST_WRITE_SCRIPT = `
local rev = tonumber(redis.call('GET', KEYS[2]) or '0') or 0
if rev ~= tonumber(ARGV[1]) then return 0 end
local limit = tonumber(ARGV[3])
local before = 0
local cur = redis.call('GET', KEYS[1])
if cur then
  local ok, d = pcall(cjson.decode, cur)
  if ok and type(d) == 'table' and type(d.items) == 'table' then before = #d.items end
end
local ok2, n = pcall(cjson.decode, ARGV[2])
if not ok2 or type(n) ~= 'table' or type(n.items) ~= 'table' then return -2 end
local after = #n.items
if after > limit and after > before then return -1 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(rev + 1))
return 1
`;

export type WatchRedis = {
  get: <T = unknown>(key: string) => Promise<T | null>;
  eval: (script: string, keys: string[], args: string[]) => Promise<unknown>;
};

export const MAX_ATTEMPTS = 6;
/** More than any list can hold: used when the limit is irrelevant (removals and "seen" never grow the list). */
export const NO_LIMIT = 1_000_000;

export type UpdateResult =
  | { ok: true; state: WatchState; dropped: number }
  | { ok: false; error: "invalid" | "limit"; state: WatchState }
  | { ok: false; error: "busy" };

/**
 * Applies one operation atomically. `limit` must come from a verified membership (callers return 503 before this when it
 * is unverified). Existing coins are never trimmed: only operations that would grow the list past `limit` are refused.
 */
export async function updateWatchlist(redis: WatchRedis, userId: string, op: WatchOp, limit: number): Promise<UpdateResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Revision first, then the state: a write in between bumps the revision, so the compare-and-set below fails and retries.
    const rev = Number(await redis.get(watchlistRevKey(userId))) || 0;
    const current = normalizeState(await redis.get(watchlistKey(userId)));
    const result = applyOp(current, op, limit);
    if (!result.ok) return { ok: false, error: result.error, state: current };
    if (JSON.stringify(result.state) === JSON.stringify(current)) return { ok: true, state: current, dropped: result.dropped };
    const code = Number(await redis.eval(WATCHLIST_WRITE_SCRIPT, [watchlistKey(userId), watchlistRevKey(userId)], [String(rev), JSON.stringify(result.state), String(limit)]));
    if (code === 1) return { ok: true, state: result.state, dropped: result.dropped };
    if (code === -1) return { ok: false, error: "limit", state: current };
    if (code === -2) return { ok: false, error: "invalid", state: current };
    // 0: someone else wrote first. Re-read and apply again.
  }
  return { ok: false, error: "busy" };
}
