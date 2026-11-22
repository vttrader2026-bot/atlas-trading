"use client";
// PERF-1: the "Updated Xs ago" text. It owns the once-a-second tick (only while the tab is visible), so the Watchlist page
// no longer re-renders its whole table every second. Same wording and same translation keys as before.
import { useEffect, useState } from "react";

export default function UpdatedAgo({ updatedAt, t }: { updatedAt: number; t: (path: string) => string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!id) id = setInterval(() => setNow(Date.now()), 1000); };
    const stop = () => { if (id) { clearInterval(id); id = null; } };
    const onVis = () => { if (document.visibilityState === "visible") { setNow(Date.now()); start(); } else stop(); };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  const secondsAgo = Math.max(0, Math.round((now - updatedAt) / 1000));
  return (
    <>
      {secondsAgo < 60
        ? t("watchlist.updatedAgo").replace("{n}", String(secondsAgo))
        : t("watchlist.updatedMinAgo").replace("{n}", String(Math.floor(secondsAgo / 60)))}
    </>
  );
}
