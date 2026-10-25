"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { useLanguage } from "@/lib/i18n";
import { useAuth, UserButton } from "@clerk/nextjs";
import ThemeToggle from "@/components/ThemeToggle";
import {
  IconOverview,
  IconRadar,
  IconMarketIntel,
  IconTradeFeed,
} from "@/components/icons";

const LANG_OPTIONS: { code: "en" | "ar" | "fr"; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ar", label: "AR" },
  { code: "fr", label: "FR" },
];

function LangSwitcher({
  lang,
  setLang,
}: {
  lang: "en" | "ar" | "fr";
  setLang: (l: "en" | "ar" | "fr") => void;
}) {
  return (
    <div className="shrink-0 flex items-center gap-0.5 rounded-md border border-line p-0.5">
      {LANG_OPTIONS.map((opt) => (
        <button
          key={opt.code}
          type="button"
          onClick={() => setLang(opt.code)}
          className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
            lang === opt.code ? "bg-gold/15 text-gold" : "text-text-muted hover:text-text"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Desktop "command bar" nav item: compact icon + label, with a restrained
// active indicator (filled pill + gold underline) rather than a loud tab.
function CommandNavLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={label}
      className={`group relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors duration-150 ${
        active ? "bg-gold/10 text-text" : "text-text-muted hover:bg-surface-raised/70 hover:text-text"
      }`}
    >
      <span
        className={`flex shrink-0 items-center transition-colors duration-150 ${
          active ? "text-gold" : "text-text-muted group-hover:text-text"
        }`}
      >
        {icon}
      </span>
      <span className="hidden lg:inline">{label}</span>
      {active && (
        <span
          className="pointer-events-none absolute inset-x-2 -bottom-[5px] h-[1.5px] rounded-full bg-gold"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const { lang, setLang, t } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const marketIntelLabel = t("nav.marketIntel");

  // Desktop "ATLAS Command Bar" — the five primary market-intelligence
  // destinations. Trade Plan, Risk, and Journal are intentionally not
  // listed here (hidden from navigation per the redesign), but their
  // routes, pages, and data are untouched and still reachable directly,
  // from the footer, and from the mobile menu below.
  const COMMAND_LINKS = [
    { href: "/", icon: <IconOverview className="w-[18px] h-[18px]" />, label: t("nav.overview") },
    { href: "/radar", icon: <IconRadar className="w-[18px] h-[18px]" />, label: t("nav.radar") },
    {
      href: "/market-intelligence",
      icon: <IconMarketIntel className="w-[18px] h-[18px]" />,
      label: marketIntelLabel,
    },
    {
      href: "/trade-feed",
      icon: <IconTradeFeed className="w-[18px] h-[18px]" />,
      label: t("nav.tradeFeed"),
    },
  ];

  // Mobile menu is unchanged by this redesign: all tools, including Trade
  // Plan, Risk, and Journal, remain exactly where they were.
  const MOBILE_GROUPS: { label: string; links: { href: string; label: string }[] }[] = [
    {
      label: "MARKETS",
      links: [
        { href: "/radar", label: t("nav.radar") },
        { href: "/market-intelligence", label: marketIntelLabel },
        { href: "/trade-feed", label: t("nav.tradeFeed") },
      ],
    },
    {
      label: "TRADING",
      links: [
        { href: "/analyzer", label: t("nav.analyzer") },
        { href: "/trade-plan", label: t("nav.tradePlan") },
        { href: "/risk", label: t("nav.risk") },
        { href: "/journal", label: t("nav.journal") },
      ],
    },
    {
      label: "LEARN",
      links: [{ href: "/academy", label: t("nav.academy") }],
    },
  ];

  const eliteLabel = lang === "ar" ? "إيليت" : "Elite";
  const eliteActive = pathname === "/elite";
  const elitePillClass = `shrink-0 whitespace-nowrap rounded-full border text-xs font-semibold transition-colors ${
    eliteActive
      ? "border-gold bg-gold/15 text-gold"
      : "border-gold/40 bg-gold/10 text-gold hover:bg-gold/15"
  }`;

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
      <LangSwitcher lang={lang} setLang={setLang} />
    </>
  );

  return (
    <header className="relative sticky top-0 z-40 backdrop-blur-md bg-bg/75 border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-2 h-14">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden sm:flex flex-1 min-w-0 items-center justify-end sm:justify-center"
        >
          <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none rounded-lg border border-line/70 bg-surface/50 p-1">
            {COMMAND_LINKS.map((link) => (
              <CommandNavLink
                key={link.href}
                href={link.href}
                icon={link.icon}
                label={link.label}
                active={pathname === link.href || pathname.startsWith(`${link.href}/`)}
              />
            ))}
          </div>
          <Link href="/elite" className={`${elitePillClass} ms-2 px-3 py-1.5`}>
            {"⚜ "}
            {eliteLabel}
          </Link>
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
        <div className="sm:hidden absolute inset-x-0 top-full z-50 border-t border-line bg-surface shadow-lg max-h-[calc(100vh-3.5rem)] overflow-y-auto">
          <nav className="max-w-6xl mx-auto px-4 py-2">
            {MOBILE_GROUPS.map((group) => (
              <div key={group.label} className="py-2 border-b border-line last:border-b-0">
                <div className="px-2 text-label">{group.label}</div>
                <div className="mt-1 flex flex-col">
                  {group.links.map((link) => {
                    const active = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`px-2 py-2 text-sm transition-colors ${
                          active ? "text-text" : "text-text-muted hover:text-text"
                        }`}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="max-w-6xl mx-auto px-4 py-3 border-t border-line">
            <Link href="/elite" className={`${elitePillClass} inline-flex items-center gap-1.5 px-3 py-1.5 text-sm`}>
              {"⚜ "}
              {lang === "ar" ? "أطلس " : "Atlas "}
              {eliteLabel}
            </Link>
          </div>

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
            <LangSwitcher lang={lang} setLang={setLang} />
          </div>
        </div>
      )}
    </header>
  );
}
