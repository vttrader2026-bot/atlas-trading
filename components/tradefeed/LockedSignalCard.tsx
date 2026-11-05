"use client";

// ELITE-LOCKED-v1
// Preview of an OPEN ELITE signal for viewers without ELITE access. It only ever receives what the server sends for a
// locked signal (coin, timeframe, date, status, confirmation count): no levels exist in the browser to hide.

import type { ReactNode } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import type { LockedSignal } from "@/lib/tradeFeed";

export function LockedSignalCard({ signal, logo }: { signal: LockedSignal; logo: ReactNode }) {
  const { t, lang } = useLanguage();
  const dateLocale = lang === "ar" ? "en-GB" : lang === "fr" ? "fr" : "en";
  const when = new Date(signal.createdAt).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <article
      data-locked="true"
      className="@container relative flex flex-col overflow-hidden rounded-2xl border border-gold/25 bg-gradient-to-b from-surface-raised to-surface shadow-[0_18px_44px_-24px_color-mix(in_srgb,var(--gold)_55%,transparent)]"
    >
      <div aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-gold to-transparent" />
      <div className="flex flex-1 flex-col gap-4 p-4 @md:p-5">
        <header className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-full p-0.5 ring-1 ring-gold/40">{logo}</div>
          <div className="min-w-0">
            <h3 className="font-heading text-xl font-semibold leading-tight tracking-tight">
              <span dir="ltr" className="font-data" style={{ unicodeBidi: "isolate" }}>{signal.pair}</span>
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-gold">ELITE</span>
              {signal.timeframe && (
                <span className="inline-flex items-center rounded-md border border-line px-2 py-0.5 text-xs text-text-muted">
                  <span dir="ltr" className="font-data" style={{ unicodeBidi: "isolate" }}>{signal.timeframe}</span>
                </span>
              )}
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            {t("tradeFeed.lockedOpen")}
          </span>
          <time dir="ltr" style={{ unicodeBidi: "isolate" }} dateTime={new Date(signal.createdAt).toISOString()} className="text-xs text-text-muted">{when}</time>
        </div>

        <div className="rounded-xl border border-line bg-surface/60 p-4 text-center">
          <div aria-hidden className="text-xl">🔒</div>
          <p className="mt-1 text-sm font-medium">{t("tradeFeed.lockedMsg")}</p>
        </div>

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-text-muted">
            {t("tradeFeed.confirmations")}: <span dir="ltr" className="font-data text-text">{signal.confirmations}</span>
          </span>
          <Link href="/elite" className="btn-primary">{t("tradeFeed.unlockElite")}</Link>
        </footer>
      </div>
    </article>
  );
}
