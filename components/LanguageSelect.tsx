"use client";

// Global header language selector: compact flag + code; opens a list with the full language names.
// Reuses the existing language state and persistence (useLanguage().setLang); it never navigates,
// so the current page, its scroll position and any typed input stay as they are.

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import LangFlag, { type LangCode } from "@/components/LangFlags";

export const LANGUAGES: { code: LangCode; short: string; name: string }[] = [
  { code: "ar", short: "AR", name: "العربية" },
  { code: "fr", short: "FR", name: "Français" },
  { code: "en", short: "EN", name: "English" },
];

export default function LanguageSelect() {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[2];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    items.current[LANGUAGES.findIndex((l) => l.code === lang)]?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open, lang]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("[data-lang-trigger]")?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = items.current.findIndex((el) => el === document.activeElement);
    const next = (i + (e.key === "ArrowDown" ? 1 : -1) + LANGUAGES.length) % LANGUAGES.length;
    items.current[next]?.focus();
  }

  return (
    <div ref={root} className="relative shrink-0" onKeyDown={onKey}>
      <button
        type="button"
        data-lang-trigger
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("nav.language")}: ${current.name}`}
        className="flex h-9 items-center gap-1.5 rounded-md border border-line px-2 text-xs font-medium text-text-muted transition-colors hover:border-text-muted hover:text-text"
      >
        <LangFlag code={current.code} />
        <span dir="ltr">{current.short}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" aria-label={t("nav.language")} className="absolute end-0 top-full z-50 mt-1 min-w-44 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-lg">
          {LANGUAGES.map((l, i) => {
            const on = l.code === lang;
            return (
              <button
                key={l.code}
                ref={(el) => { items.current[i] = el; }}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                lang={l.code}
                onClick={() => { setLang(l.code); setOpen(false); }}
                className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm transition-colors ${on ? "bg-gold/15 font-semibold text-gold" : "text-text hover:bg-gold/5"}`}
              >
                <LangFlag code={l.code} />
                <span className="flex-1">{l.name}</span>
                <span dir="ltr" className="text-xs text-text-muted">{l.short}</span>
                {on && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M2.5 7.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
