"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { useLanguage } from "@/lib/i18n";
import { useAuth, UserButton } from "@clerk/nextjs";
import ThemeToggle from "@/components/ThemeToggle";

export default function Nav() {
  const pathname = usePathname();
  const { lang, toggleLang, t } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const LINKS = [
    { href: "/radar", label: t("nav.radar") },
    { href: "/analyzer", label: t("nav.analyzer") },
    { href: "/trade-feed", label: t("nav.tradeFeed") },
    { href: "/trade-plan", label: t("nav.tradePlan") },
    { href: "/journal", label: t("nav.journal") },
    { href: "/risk", label: t("nav.risk") },
  ];

  const controls = (
    <>
      {isLoaded && !isSignedIn && (
        <Link
          href="/sign-in"
          className="shrink-0 px-2.5 py-1 rounded-md border border-line text-xs text-text-muted hover:text-text hover:border-text-muted transition-colors"
        >
          {t("nav.signIn")}
        </Link>
      )}
      {isLoaded && isSignedIn && (
        <>
          <Link
            href="/account"
            className="shrink-0 px-2 py-1 text-xs text-text-muted hover:text-text transition-colors"
          >
            {t("nav.account")}
          </Link>
          <UserButton />
        </>
      )}
      <ThemeToggle />
      <button
        onClick={toggleLang}
        className="shrink-0 px-2.5 py-1 rounded-md border border-line text-xs text-text-muted hover:text-text hover:border-text-muted transition-colors"
      >
        {lang === "en" ? "العربية" : "English"}
      </button>
    </>
  );

  return (
    <header className="relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-2 h-14">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>
        <nav className="hidden sm:flex flex-1 min-w-0 items-center justify-end gap-0.5 overflow-x-auto scrollbar-none">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative shrink-0 whitespace-nowrap px-2.5 sm:px-3 py-1.5 text-sm transition-colors ${
                  active ? "text-text" : "text-text-muted hover:text-text"
                }`}
              >
                {link.label}
                {active && (
                  <span className="absolute left-2.5 right-2.5 sm:left-3 sm:right-3 -bottom-[1px] h-[1.5px] bg-gold" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="hidden sm:flex items-center gap-2 shrink-0 ms-auto">{controls}</div>

        <div className="flex sm:hidden items-center gap-2 ms-auto">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="w-9 h-9 flex items-center justify-center rounded-md border border-line text-text-muted hover:text-text hover:border-text-muted transition-colors"
          >
            {open ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3 3l12 12M15 3L3 15" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M2 5h14M2 9h14M2 13h14" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="sm:hidden absolute inset-x-0 top-full z-50 border-t border-line bg-surface shadow-lg">
          <nav className="max-w-6xl mx-auto px-4 py-2 flex flex-col">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-2 py-2.5 text-sm border-b border-line last:border-b-0 transition-colors ${
                    active ? "text-text" : "text-text-muted hover:text-text"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="max-w-6xl mx-auto px-4 pb-3 pt-1 flex flex-wrap items-center gap-2">
            {isLoaded && !isSignedIn && (
              <Link
                href="/sign-in"
                className="shrink-0 px-2.5 py-1 rounded-md border border-line text-xs text-text-muted hover:text-text hover:border-text-muted transition-colors"
              >
                {t("nav.signIn")}
              </Link>
            )}
            {isLoaded && isSignedIn && (
              <>
                <Link
                  href="/account"
                  className="shrink-0 px-2 py-1 text-xs text-text-muted hover:text-text transition-colors"
                >
                  {t("nav.account")}
                </Link>
                <UserButton />
              </>
            )}
            <button
              onClick={toggleLang}
              className="shrink-0 px-2.5 py-1 rounded-md border border-line text-xs text-text-muted hover:text-text hover:border-text-muted transition-colors"
            >
              {lang === "en" ? "العربية" : "English"}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
