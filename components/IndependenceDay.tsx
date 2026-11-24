import { IDAY_CSS, IDAY_SCRIPT, IDAY_TEXT } from "@/lib/independenceDay";

// TEMPORARY (Mauritania Independence Day, 28 Nov 2026). A server component: no client JavaScript, no state, no dictionary changes.
// Mounted once in app/layout.tsx. Invisible at all times except 28 Nov (UTC), decided by the tiny script below before first paint.
// To remove after the holiday: delete this file, lib/independenceDay.ts, its test, and the two lines in app/layout.tsx.
export default function IndependenceDay() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: IDAY_CSS }} />
      <script dangerouslySetInnerHTML={{ __html: IDAY_SCRIPT }} />
      <div className="mr-day border-b border-line bg-surface/60" role="note">
        <p className="max-w-6xl mx-auto px-4 py-3 sm:py-3.5 flex items-center justify-center gap-3 text-center text-[14px] sm:text-[15px] lg:text-[16px] leading-snug text-text-muted">
          {/* Mauritanian flag (green, gold crescent and star, red bands). Drawn inline because flag emoji do not render on Windows. */}
          <svg aria-hidden="true" width="26" height="18" viewBox="0 0 30 20" className="shrink-0 rounded-[2px]">
            <rect width="30" height="20" fill="#006233" />
            <rect width="30" height="3" fill="#D01C1F" />
            <rect y="17" width="30" height="3" fill="#D01C1F" />
            <circle cx="15" cy="10.8" r="5.2" fill="#FFC400" />
            <circle cx="15" cy="9" r="4.5" fill="#006233" />
            <polygon fill="#FFC400" points="15.00,6.20 15.45,7.49 16.81,7.51 15.72,8.33 16.12,9.64 15.00,8.86 13.88,9.64 14.28,8.33 13.19,7.51 14.55,7.49" />
          </svg>
          <span>
            <span data-l="en" lang="en">{IDAY_TEXT.en}</span>
            <span data-l="ar" lang="ar" dir="rtl">{IDAY_TEXT.ar}</span>
            <span data-l="fr" lang="fr">{IDAY_TEXT.fr}</span>
          </span>
        </p>
      </div>
    </>
  );
}
