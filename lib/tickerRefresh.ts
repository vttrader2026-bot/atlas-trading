// Polling refresh for the Trade Feed's live prices (extracted from the page so it can be tested without a browser).
// Fetches every symbol now, then every `intervalMs` while the tab is visible, and again when the tab becomes visible.
// A failed symbol is skipped and the previous good value stays (callers merge); one bad pair never blocks the rest.

export const TICKER_REFRESH_MS = 15_000;

export type RefreshEnv = {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  isVisible: () => boolean;
  /** Registers a visibility-change listener; returns the remover. */
  onVisibilityChange: (fn: () => void) => () => void;
};

export function startTickerRefresh<T>(opts: {
  symbols: string[];
  fetchTicker: (symbol: string) => Promise<T>;
  onUpdate: (fresh: Record<string, T>) => void;
  intervalMs?: number;
  env: RefreshEnv;
}): () => void {
  const { symbols, fetchTicker, onUpdate, env } = opts;
  let cancelled = false;
  const refresh = async () => {
    const results = await Promise.all(symbols.map((sym) => fetchTicker(sym).then((d) => [sym, d] as const).catch(() => null)));
    if (cancelled) return;
    const fresh: Record<string, T> = {};
    for (const r of results) if (r) fresh[r[0]] = r[1];
    onUpdate(fresh);
  };
  void refresh();
  const id = env.setInterval(() => {
    if (env.isVisible()) void refresh();
  }, opts.intervalMs ?? TICKER_REFRESH_MS);
  const off = env.onVisibilityChange(() => {
    if (env.isVisible()) void refresh();
  });
  return () => {
    cancelled = true;
    env.clearInterval(id);
    off();
  };
}

/** Browser environment for startTickerRefresh. */
export const browserRefreshEnv = (): RefreshEnv => ({
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id as number),
  isVisible: () => document.visibilityState === "visible",
  onVisibilityChange: (fn) => {
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  },
});
