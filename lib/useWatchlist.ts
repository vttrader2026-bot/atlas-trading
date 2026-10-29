"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  addSymbol, attach, dismissMergeNotice, getServerState, getState, refresh, removeSymbol, saveSeen, subscribe,
} from "@/lib/watchlistStore";

/** Shared watchlist state: every component using this sees the same list. */
export function useWatchlist() {
  const { isLoaded, userId } = useAuth();
  const s = useSyncExternalStore(subscribe, getState, getServerState);

  useEffect(() => {
    if (!isLoaded) return;
    attach(userId ?? null);
  }, [isLoaded, userId]);

  // Pick up changes made on another device when this tab becomes active again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const has = useCallback((symbol: string) => s.items.some((i) => i.symbol === symbol), [s.items]);

  return {
    items: s.items,
    seen: s.seen,
    limit: s.limit,
    plan: s.plan,
    signedIn: s.signedIn,
    ready: s.ready,
    syncError: s.syncError,
    mergedDropped: s.mergedDropped,
    has,
    add: addSymbol,
    remove: removeSymbol,
    saveSeen,
    dismissMergeNotice,
  };
}
