"use client";

// Header bell: a visible way into the existing Notification Settings (the section on /account).
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";

export default function NotificationBell() {
  const { t } = useLanguage();
  return (
    <Link
      href="/account#notifications"
      aria-label={t("nav.notifications")}
      title={t("nav.notifications")}
      data-notification-bell
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-text-muted transition-colors hover:border-text-muted hover:text-text"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </svg>
    </Link>
  );
}
