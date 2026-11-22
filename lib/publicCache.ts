// PERF-1: CDN cache headers for PUBLIC, non-personalised GET responses only (market data that is the same for every visitor).
// Never use this on a route that reads the session, a plan, or anything per-user.
export const cdnCache = (sMaxAge: number, staleWhileRevalidate: number): Record<string, string> => ({
  "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
});
