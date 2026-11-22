"use client";
// PERF-1: the always-mounted extras (WhatsApp button, Welcome popup, add-email reminder) are not needed for the first paint.
// They load as separate chunks once the browser is idle, so they no longer sit in every page's first JavaScript download.
// Same position in the layout, same providers, same behaviour: they simply appear a moment after the page.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const WhatsAppSupportButton = dynamic(() => import("@/components/WhatsAppSupportButton"), { ssr: false });
const WelcomePopup = dynamic(() => import("@/components/WelcomePopup"), { ssr: false });
const EmailRecoveryNotice = dynamic(() => import("@/components/EmailRecoveryNotice"), { ssr: false });

export default function LazyGlobals() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(id);
  }, []);
  if (!ready) return null;
  return (
    <>
      <WhatsAppSupportButton />
      <WelcomePopup />
      <EmailRecoveryNotice />
    </>
  );
}
