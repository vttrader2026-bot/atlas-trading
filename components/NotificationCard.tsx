"use client";

// First-time activation card for the Dashboard. Shown only to signed-in users whose notifications are off
// and who have not dismissed it. It asks for nothing itself: the button opens Notification Settings, where
// the browser permission is requested only after the user turns notifications on.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";

export const NOTIFICATION_CARD_KEY = "atlas-trading.notifcard.dismissed";

function dismissedBefore(): boolean {
  try { return window.localStorage.getItem(NOTIFICATION_CARD_KEY) === "1"; } catch { return false; }
}

export default function NotificationCard() {
  const { t } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || dismissedBefore()) return;
    let cancelled = false;
    fetch("/api/me/prefs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((d) => { if (!cancelled && d?.prefs && d.prefs.enabled !== true) setShow(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);

  function dismiss() {
    try { window.localStorage.setItem(NOTIFICATION_CARD_KEY, "1"); } catch { /* the card just returns next visit */ }
    setShow(false);
  }

  if (!show) return null;
  return (
    <section data-notification-card aria-label={t("account.cardTitle")} className="mt-6 card card-accent p-4 sm:p-5 flex items-start gap-3">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-gold">
        <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </svg>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">{t("account.cardTitle")}</h2>
        <p className="mt-1 text-sm text-text-muted max-w-2xl">{t("account.cardBody")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/account#notifications" onClick={dismiss} className="btn-primary !py-1.5 text-sm">{t("account.cardCta")}</Link>
          <button type="button" onClick={dismiss} className="btn-secondary !py-1.5 text-sm">{t("account.cardDismiss")}</button>
        </div>
      </div>
      <button type="button" onClick={dismiss} aria-label={t("account.cardDismiss")} className="shrink-0 -m-1 flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:text-text">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" strokeLinecap="round" /></svg>
      </button>
    </section>
  );
}
