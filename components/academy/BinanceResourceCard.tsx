"use client";

import { useLanguage } from "@/lib/i18n";
import { BINANCE_RESOURCE as R } from "@/lib/binanceResource";
import ReferralCTA from "@/components/academy/ReferralCTA";

// ATLAS-BINANCE-CARD-v1
// Standalone premium resource card (not a lesson). Reuses ReferralCTA for the button, code, copy and disclosure.
export default function BinanceResourceCard() {
  const { lang } = useLanguage();

  return (
    <section aria-labelledby="binance-resource-title" className="mt-8">
      <div className="relative mx-auto w-full max-w-[42rem] rounded-3xl border border-gold/30 bg-gradient-to-b from-surface-raised to-surface p-6 sm:aspect-square sm:p-7 shadow-[0_24px_60px_-28px_color-mix(in_srgb,var(--gold)_60%,transparent)]">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          <div
            className="absolute -top-24 -end-24 h-64 w-64 rounded-full opacity-60"
            style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--gold) 28%, transparent), transparent 65%)" }}
          />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
        </div>

        <div className="relative flex min-h-full flex-col">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold/40 bg-gold/10 text-gold"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                <path d="M12 3 15 6l-3 3-3-3 3-3Zm0 12 3 3-3 3-3-3 3-3ZM6 9l3 3-3 3-3-3 3-3Zm12 0 3 3-3 3-3-3 3-3Z" />
              </svg>
            </span>
            <span className="text-label text-gold">{R.eyebrow[lang]}</span>
          </div>

          <h2 id="binance-resource-title" className="mt-3 font-heading text-2xl font-semibold tracking-tight">
            {R.title[lang]}
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">{R.intro[lang]}</p>

          <dl className="mt-3 space-y-3">
            <div className="border-s-2 border-gold/50 ps-3">
              <dt className="text-label text-gold">{R.registrationLabel[lang]}</dt>
              <dd className="mt-0.5 text-sm leading-6 text-text-muted">{R.registration[lang]}</dd>
            </div>
            <div className="border-s-2 border-gold/50 ps-3">
              <dt className="text-label text-gold">{R.securityLabel[lang]}</dt>
              <dd className="mt-0.5 text-sm leading-6 text-text-muted">{R.security[lang]}</dd>
            </div>
          </dl>

          <div className="mt-auto">
            <ReferralCTA
              href={R.href}
              code={R.code}
              className="mt-4 rounded-2xl border border-gold/30 bg-gold/[0.06] p-4"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
