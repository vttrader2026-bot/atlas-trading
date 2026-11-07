"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { signalHref, type ActiveSignalRef } from "@/lib/activeSignals";

/** "Active Signal" pill that opens the exact setup in the Trade Feed. Renders nothing without an active setup. */
export default function ActiveSignalBadge({ signal, coin, className = "" }: { signal: ActiveSignalRef | null; coin: string; className?: string }) {
  const { t } = useLanguage();
  if (!signal) return null;
  const label = t("tradeFeed.activeSignal");
  return (
    <Link
      href={signalHref(signal.id)}
      aria-label={`${label}: ${coin}`}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gold/50 bg-gold/10 px-2.5 py-0.5 text-[0.7rem] font-semibold text-gold transition-colors hover:bg-gold/20 ${className}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gold" />
      {label}
    </Link>
  );
}
