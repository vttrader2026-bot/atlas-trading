// ATLAS MARKET INTELLIGENCE — persistent historical snapshots.
// Stored in the same Upstash Redis instance already used across the app
// (lib/userStore.ts's getRedis()). A daily cron (api/cron/market-intel-snapshot)
// writes one snapshot per day; the first-ever snapshot becomes the baseline.
// A universe-change log records every time the tracked asset list changes,
// so later readers can see what was added/removed and when (reduces
// survivorship bias when assets are later removed from the registry).

import { getRedis } from "./userStore";
import { TRACKED_SYMBOLS } from "./marketIntelAssets";

const SNAPSHOT_PREFIX = "mi:snapshot:"; // + YYYY-MM-DD
const SNAPSHOT_DATES_KEY = "mi:snapshot-dates";
const BASELINE_KEY = "mi:baseline";
const LAST_UNIVERSE_KEY = "mi:last-universe";
const UNIVERSE_LOG_KEY = "mi:universe-log";

export type DailySnapshot = {
  date: string; // YYYY-MM-DD
  prices: Record<string, number>; // symbol -> close/last price in USDT
  btcPrice: number;
  takenAt: string; // ISO timestamp
};

export type UniverseLogEntry = {
  date: string;
  added: string[];
  removed: string[];
};

export async function writeDailySnapshot(prices: Record<string, number>, btcPrice: number): Promise<DailySnapshot | null> {
  const redis = getRedis();
  if (!redis) return null;

  const date = new Date().toISOString().slice(0, 10);
  const snapshot: DailySnapshot = { date, prices, btcPrice, takenAt: new Date().toISOString() };

  await redis.set(`${SNAPSHOT_PREFIX}${date}`, snapshot);
  await redis.sadd(SNAPSHOT_DATES_KEY, date);

  const baseline = await redis.get<DailySnapshot>(BASELINE_KEY);
  if (!baseline) {
    await redis.set(BASELINE_KEY, snapshot);
  }

  const lastUniverse = (await redis.get<string[]>(LAST_UNIVERSE_KEY)) ?? [];
  const current = TRACKED_SYMBOLS;
  const added = current.filter((s) => !lastUniverse.includes(s));
  const removed = lastUniverse.filter((s) => !current.includes(s));
  if (lastUniverse.length > 0 && (added.length > 0 || removed.length > 0)) {
    const entry: UniverseLogEntry = { date, added, removed };
    await redis.rpush(UNIVERSE_LOG_KEY, entry);
  }
  await redis.set(LAST_UNIVERSE_KEY, current);

  return snapshot;
}

export async function getBaselineSnapshot(): Promise<DailySnapshot | null> {
  const redis = getRedis();
  if (!redis) return null;
  return (await redis.get<DailySnapshot>(BASELINE_KEY)) ?? null;
}

export async function getUniverseLog(): Promise<UniverseLogEntry[]> {
  const redis = getRedis();
  if (!redis) return [];
  const raw = await redis.lrange<UniverseLogEntry>(UNIVERSE_LOG_KEY, 0, -1);
  return raw ?? [];
}
