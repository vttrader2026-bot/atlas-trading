// Lean, dependency-free Redis accessor. Deliberately has NO import of
// @clerk/nextjs/server or anything else auth-related — this file exists
// specifically so that modules which only need Redis (e.g. the market-data
// layer in lib/marketData*.ts) don't have to drag in the Clerk server SDK
// just to call getRedis(). Keeping this import graph lean also keeps the
// market-data test suite fast and free of any auth-stack side effects.
import { Redis } from "@upstash/redis";

export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}
// UNIQUE-MARKER-TESTFIX-OCT25-0338
