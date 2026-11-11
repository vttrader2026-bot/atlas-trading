// USD→MRU reference rate for the Atlas Investor display-currency option. Server side only.
// Source: https://open.er-api.com/v6/latest/USD (ExchangeRate-API open access; attribution is shown in the UI).
// This is a reference rate. It is NOT a Binance P2P buy/sell price. There is no hardcoded fallback rate:
// if nothing valid is available the caller gets { ok: false } and the page shows USDT.

import { MAX_RATE_AGE_MS, isRateUsable, isValidRate, type RateInfo } from "@/lib/investor/currency";

export const FX_URL = "https://open.er-api.com/v6/latest/USD";
export const FX_CACHE_KEY = "fx:usd-mru";
const FX_ATTEMPT_KEY = "fx:usd-mru:attempt";

// Freshness and retention are separate on purpose:
//  - FRESHNESS decides when to ask the provider again: at the provider's own next-update time when it gives one, and at
//    the latest after 12 hours. A rate is "fresh" until then and is served from Redis without any upstream call.
//  - RETENTION decides how long the last valid rate stays in Redis (72 hours), so it can still be reused when the
//    provider is unreachable after the 12 hours. Reuse is capped by AGE, not retention: a rate whose source update is
//    older than 48 hours is never returned (see isRateUsable), even though it may still sit in Redis.
/** Longest a rate is served without asking the provider again. */
export const FX_FRESH_MS = 12 * 60 * 60 * 1000;
/** How long the last valid rate is kept in Redis (≥ the 48h usage limit, with margin). */
export const FX_RETAIN_SEC = 72 * 60 * 60;
/** When the provider's next-update time has passed but it has not published yet, ask again at most this often. */
export const FX_RETRY_MS = 15 * 60 * 1000;
/** After a failed upstream call, do not hammer the provider for this long. */
export const FX_FAIL_BACKOFF_SEC = 5 * 60;
const FETCH_TIMEOUT_MS = 6000;

type RedisLike = {
  get: <T>(k: string) => Promise<T | null>;
  set: (k: string, v: unknown, o?: { ex: number }) => Promise<unknown>;
};

/** What is stored in Redis: the public rate plus the provider's announced next update (internal, never sent to the page). */
type Stored = RateInfo & { nextUpdateAt?: number };

/**
 * Validates the open.er-api.com payload: result === "success", base_code === "USD", a positive finite MRU rate and a
 * valid update timestamp. Anything else returns null.
 */
export function parseRatePayload(json: unknown, now: number): Stored | null {
  if (typeof json !== "object" || json === null) return null;
  const j = json as Record<string, unknown>;
  if (j.result !== "success" || j.base_code !== "USD") return null;
  const rates = j.rates;
  if (typeof rates !== "object" || rates === null) return null;
  const rate = (rates as Record<string, unknown>).MRU;
  if (!isValidRate(rate)) return null;
  let updated = NaN;
  if (typeof j.time_last_update_unix === "number") updated = j.time_last_update_unix * 1000;
  else if (typeof j.time_last_update_utc === "string") updated = Date.parse(j.time_last_update_utc);
  if (!Number.isFinite(updated) || updated <= 0) return null;
  const out: Stored = { rate, sourceUpdatedAt: updated, fetchedAt: now };
  const next = typeof j.time_next_update_unix === "number" ? j.time_next_update_unix * 1000 : NaN;
  if (Number.isFinite(next) && next > updated) out.nextUpdateAt = next;
  return out;
}

const isStored = (v: unknown): v is Stored =>
  typeof v === "object" && v !== null && isValidRate((v as Stored).rate) &&
  typeof (v as Stored).sourceUpdatedAt === "number" && Number.isFinite((v as Stored).sourceUpdatedAt) &&
  typeof (v as Stored).fetchedAt === "number" && Number.isFinite((v as Stored).fetchedAt);

/** Is the cached rate still fresh, i.e. is there no reason to ask the provider again yet? */
export function isCacheFresh(c: Stored, now: number): boolean {
  const age = now - c.fetchedAt;
  if (age < 0 || age >= FX_FRESH_MS) return false;
  // The provider said when its next update is. Once that time has passed, look again — but not more often than every 15 min.
  if (c.nextUpdateAt !== undefined && now >= c.nextUpdateAt && age >= FX_RETRY_MS) return false;
  return true;
}

const publicInfo = (c: Stored, stale: boolean): RateInfo => ({ rate: c.rate, sourceUpdatedAt: c.sourceUpdatedAt, fetchedAt: c.fetchedAt, stale });

export type RateResult = { ok: true; info: RateInfo } | { ok: false };

/**
 * Serves the cached rate while it is fresh; otherwise asks the provider. If the provider fails, the last valid cached
 * rate is reused (flagged stale) as long as its source update is at most 48 hours old. A valid cached rate is never
 * overwritten by invalid data, and never replaced by older data.
 */
export async function getUsdMruRate(deps: { redis: RedisLike | null; fetchFn?: typeof fetch; now?: number }): Promise<RateResult> {
  const now = deps.now ?? Date.now();
  const fetchFn = deps.fetchFn ?? fetch;
  let cached: Stored | null = null;
  let backoff = false;
  try {
    const raw = deps.redis ? await deps.redis.get<unknown>(FX_CACHE_KEY) : null;
    cached = isStored(raw) ? raw : null;
    backoff = !!deps.redis && (await deps.redis.get<unknown>(FX_ATTEMPT_KEY)) !== null;
  } catch {
    cached = null; // a Redis problem must not hide a rate we can still fetch
  }
  if (cached && isCacheFresh(cached, now) && isRateUsable(cached, now)) return { ok: true, info: publicInfo(cached, false) };

  let fresh: Stored | null = null;
  if (!backoff) {
    try {
      const res = await fetchFn(FX_URL, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok) fresh = parseRatePayload(await res.json(), now);
    } catch {
      fresh = null;
    }
    if (!fresh) {
      try {
        await deps.redis?.set(FX_ATTEMPT_KEY, now, { ex: FX_FAIL_BACKOFF_SEC }); // marker only; the cached rate is not touched
      } catch {
        /* best effort */
      }
    }
  }

  if (fresh) {
    // Never go back in time: if the provider still reports the same (or an older) update, keep the stored rate and just
    // note that we looked, so the next look follows the schedule.
    const next: Stored = cached && fresh.sourceUpdatedAt <= cached.sourceUpdatedAt ? { ...cached, fetchedAt: now, nextUpdateAt: fresh.nextUpdateAt ?? cached.nextUpdateAt } : fresh;
    try {
      await deps.redis?.set(FX_CACHE_KEY, next, { ex: FX_RETAIN_SEC });
    } catch {
      /* caching is best effort */
    }
    return isRateUsable(next, now) ? { ok: true, info: publicInfo(next, false) } : { ok: false };
  }
  if (cached && isRateUsable(cached, now)) return { ok: true, info: publicInfo(cached, true) };
  return { ok: false };
}

export { MAX_RATE_AGE_MS };
