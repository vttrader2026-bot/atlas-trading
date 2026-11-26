"use client";

// Real browser fullscreen (Fullscreen API, with the WebKit-prefixed variants
// for older Safari/iPadOS) for one element. No fake "tall container" mode:
// `active` always mirrors document.fullscreenElement, so Escape, the browser's
// own exit controls and OS gestures all stay in sync. Where fullscreen is
// unavailable (e.g. iPhone Safari) `supported` is false; a rejected request
// sets `failed` briefly so the UI can say so.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const fsDoc = (): FsDocument => document as FsDocument;
const currentElement = () => fsDoc().fullscreenElement ?? fsDoc().webkitFullscreenElement ?? null;

export function isFullscreenSupported(el: FsElement | null): boolean {
  const d = fsDoc();
  const enabled = d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? false;
  return enabled && !!el && (typeof el.requestFullscreen === "function" || typeof el.webkitRequestFullscreen === "function");
}

export function useFullscreen(targetRef: RefObject<HTMLElement | null>) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flagFailure = useCallback(() => {
    setFailed(true);
    if (failTimer.current) clearTimeout(failTimer.current);
    failTimer.current = setTimeout(() => setFailed(false), 4000);
  }, []);

  useEffect(() => {
    const el = targetRef.current;
    setSupported(isFullscreenSupported(el as FsElement | null)); // feature detection needs the DOM (SSR cannot know)
    const sync = () => setActive(!!el && currentElement() === el);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    document.addEventListener("fullscreenerror", flagFailure);
    document.addEventListener("webkitfullscreenerror", flagFailure);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      document.removeEventListener("fullscreenerror", flagFailure);
      document.removeEventListener("webkitfullscreenerror", flagFailure);
      if (failTimer.current) clearTimeout(failTimer.current);
      // Leaving the page while fullscreen must not strand the browser in fullscreen.
      if (el && currentElement() === el) {
        const d = fsDoc();
        try {
          void (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d);
        } catch {
          /* already exited */
        }
      }
    };
  }, [targetRef, flagFailure]);

  const enter = useCallback(async () => {
    const el = targetRef.current as FsElement | null;
    if (!el || !isFullscreenSupported(el)) return flagFailure();
    try {
      await (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el);
    } catch {
      flagFailure(); // rejected (permissions policy, not a user gesture, ...)
    }
  }, [targetRef, flagFailure]);

  const exit = useCallback(async () => {
    const d = fsDoc();
    try {
      if (currentElement()) await (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d);
    } catch {
      /* already exited */
    }
  }, []);

  const toggle = useCallback(() => (active ? exit() : enter()), [active, enter, exit]);

  return { supported, active, failed, toggle, enter, exit };
}
