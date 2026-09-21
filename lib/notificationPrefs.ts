export type NotificationPrefs = {
  enabled: boolean;
  tradeFeed: boolean;
  market: boolean;
};

// Everything is off until the user turns it on.
export const defaultPrefs: NotificationPrefs = {
  enabled: false,
  tradeFeed: false,
  market: false,
};

// Only an explicit `true` counts as on, so missing or bad data stays off.
export function normalizePrefs(input: unknown): NotificationPrefs {
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    tradeFeed: o.tradeFeed === true,
    market: o.market === true,
  };
}