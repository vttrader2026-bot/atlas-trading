"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Logo from "@/components/Logo";
import { useLanguage } from "@/lib/i18n";

export default function Nav() {
  const pathname = usePathname();
  const { lang, toggleLang, t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  const LINKS = [
    { href: "/radar", label: t("nav.radar") },
    { href: "/analyzer", label: t("nav.analyzer") },
    { href: "/trade-plan", label: t("nav.tradePlan") },
    { href: "/journal", label: t("nav.journal") },
    { href: "/risk", label: t("nav.risk") },
  ];

  return (
    <header>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <Link href="/" onClick={() => setMenuOpen(false)}>
          <Logo />
        </Link>

        <div className="hidden sm:flex items-center gap-1">
          <nav className="flex items-center gap-1">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-3 py-1.5 text-sm transition-colors ${
                    active ? "text-text" : "text-text-muted hover:text-text"
                  }`}
                >
                  {link.label}
                  {active && (
                    <span className="absolute left-3 right-3 -bottom-[1px] h-[1.5px] bg-gold" />
                  )}
                </Link>
              );
            })}
          </nav>

          <button
            onClick={toggleLang}
            className="ms-2 px-2.5 py-1 rounded-md border border-line text-xs text-text-muted hover:text-text hover:border-text-muted transition-colors"
          >
            {lang === "en" ? "العربية" : "English"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="sm:hidden w-9 h-9 flex items-center justify-center rounded-md border border-line text-text-muted hover:text-text hover:border-text-muted transition-colors"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          <span className="text-lg leading-none">{menuOpen ? "×" : "☰"}</span>
        </button>
      </div>

      {menuOpen && (
        <div className="sm:hidden border-t border-line bg-bg">
          <nav className="px-4 py-2">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block px-2 py-3 text-sm transition-colors ${
                    active ? "text-text" : "text-text-muted hover:text-text"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            <button
              onClick={() => {
                toggleLang();
                setMenuOpen(false);
              }}
              className="w-full text-start px-2 py-3 text-sm text-text-muted hover:text-text transition-colors"
            >
              {lang === "en" ? "العربية" : "English"}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
