export type NotificationPrefs = {
  enabled: boolean;
  tradeFeed: boolean;
  market: boolean;
  educational: boolean;
  promotional: boolean;
  analyzerReset: boolean;
};

export const defaultPrefs: NotificationPrefs = {
  enabled: false,
  tradeFeed: false,
  market: false,
  educational: false,
  promotional: false,
  analyzerReset: false,
};

export function normalizePrefs(input: unknown): NotificationPrefs {
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    tradeFeed: o.tradeFeed === true,
    market: o.market === true,
    educational: o.educational === true,
    promotional: o.promotional === true,
    analyzerReset: o.analyzerReset === true,
  };
}
