"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on every visit, independent of push
 * notifications. Chrome's PWA install prompt (Android "Add to Home
 * Screen") requires an active service worker to be present — it can't
 * wait for someone to first opt into push notifications, since most
 * visitors never will. Calling register() again inside enablePush()
 * later is safe: the spec treats a repeat register() of the same script
 * URL as a no-op that resolves to the existing registration.
 */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  }, []);

  return null;
}
