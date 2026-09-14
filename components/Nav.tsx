"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { useLanguage } from "@/lib/i18n";

export default function Nav() {
  const pathname = usePathname();
  const { lang, toggleLang, t } = useLanguage();

  const LINKS = [
    { href: "/radar", label: t("nav.radar") },
    { href: "/analyzer", label: t("nav.analyzer") },
    { href: "/trade-plan", label: t("nav.tradePlan") },
    { href: "/journal", label: t("nav.journal") },
    { href: "/risk", label: t("nav.risk") },
  ];

  return (
    <header>
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
        <Link href="/">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
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
      </div>
    </header>
  );
}
