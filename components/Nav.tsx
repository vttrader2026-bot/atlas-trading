"use client";

import { useEffect, useRef, useState } from "react";
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@clerk/nextjs";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSelect from "@/components/LanguageSelect";
import NotificationBell from "@/components/NotificationBell";
import AccountMenu from "@/components/AccountMenu";
import { InstallMenuButton } from "@/components/InstallApp";
import {
  IconOverview,
  IconRadar,
  IconAcademy,
  IconTradeFeed,
} from "@/components/icons";

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
      className={`group relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 lg:px-1 xl:px-2.5 py-[7px] text-[13px] lg:text-[12.5px] xl:text-[13px] font-medium transition-colors duration-150 ${
        active ? "bg-gold/10 text-text" : "text-text-muted hover:bg-surface-raised/70 hover:text-text"
      }`}
    >
      <span
        className={`flex shrink-0 items-center lg:hidden transition-colors duration-150 ${
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

const isOn = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

// NAV-TRADE-MGMT-v1
// Desktop "Trade Management" dropdown (Trade Plan, Journal, Risk Calculator). The command bar scrolls
// horizontally, which would clip an absolutely positioned menu, so the menu is fixed-positioned from the
// button's rectangle when opened. Closes on outside click, Escape, scroll, resize or choosing an item.
function DropdownMenu({ label, items, pathname, icon }: { label: string; items: { href: string; label: string }[]; pathname: string; icon: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = items.some((i) => isOn(pathname, i.href));

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !btnRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function toggle() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const width = 224;
      const rtl = document.documentElement.dir === "rtl";
      const left = Math.min(Math.max(8, rtl ? r.right - width : r.left), window.innerWidth - width - 8);
      setPos({ top: r.bottom + 8, left });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        className={`group relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 lg:px-1 xl:px-2.5 py-[7px] text-[13px] lg:text-[12.5px] xl:text-[13px] font-medium transition-colors duration-150 ${
          active || open ? "bg-gold/10 text-text" : "text-text-muted hover:bg-surface-raised/70 hover:text-text"
        }`}
      >
        <span className={`flex shrink-0 items-center lg:hidden transition-colors duration-150 ${active ? "text-gold" : "text-text-muted group-hover:text-text"}`}>
          {icon}
        </span>
        <span className="hidden lg:inline">{label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={`hidden lg:block transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {active && <span className="pointer-events-none absolute inset-x-2 -bottom-[5px] h-[1.5px] rounded-full bg-gold" aria-hidden="true" />}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 224 }}
          className="z-50 rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              aria-current={isOn(pathname, item.href) ? "page" : undefined}
              className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                isOn(pathname, item.href) ? "bg-gold/10 text-text" : "text-text-muted hover:bg-surface-raised/70 hover:text-text"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const { lang, t } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [mkOpen, setMkOpen] = useState(false); // mobile "Markets" group

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // WORKFLOW-v1: simplified primary navigation. Dashboard opens the Journal (trade dashboard and performance);
  // Markets groups Radar, Market Pulse and Watchlist. Every other route (Analyzer, Trade Plan, Trade Feed,
  // Risk Calculator, ...) is unchanged and reachable from the Workflow page, the footer and direct links.
  const MARKETS = [
    { href: "/radar", label: t("nav.radar") },
    { href: "/market-intelligence", label: t("nav.marketIntel") },
    { href: "/watchlist", label: t("nav.watchlist") },
  ];
  const mkActive = MARKETS.some((i) => isOn(pathname, i.href));
  const homeLink = {
    href: "/",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden="true">
        <path d="M4 11.5 12 5l8 6.5M6.5 10.5V19h11v-8.5M10 19v-4.5h4V19" />
      </svg>
    ),
    label: t("nav.home"),
  };
  const dashLink = { href: "/journal", icon: <IconOverview className="w-[18px] h-[18px]" />, label: t("nav.dashboard") };
  const workflowLink = { href: "/workflow", icon: <IconTradeFeed className="w-[18px] h-[18px]" />, label: t("nav.workflow") };
  // INVESTOR-NAV: long-term investing module (private; signed-out visitors are sent to sign-in and returned).
  const investorLink = {
    href: "/investor",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />
        <path d="M15.5 3.7A9 9 0 0 1 20.3 8.5h-4.8V3.7Z" />
      </svg>
    ),
    label: t("nav.investor"),
  };
  const academyLink = { href: "/academy", icon: <IconAcademy className="w-[18px] h-[18px]" />, label: t("nav.academy") };
  const COMMAND_LINKS = [homeLink, dashLink, workflowLink, investorLink];

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
          <NotificationBell />
          <Link
            href="/account"
            className="shrink-0 px-2 py-1 text-xs text-text-muted hover:text-text transition-colors"
          >
            {t("nav.account")}
          </Link>
          <AccountMenu />
        </>
      )}
      <ThemeToggle />
      <LanguageSelect />
    </>
  );

  return (
    <header className="relative sticky top-0 z-40 backdrop-blur-md bg-bg/75 border-b border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-2 h-14">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden sm:flex flex-1 min-w-0 items-center justify-end sm:justify-center"
        >
          <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none rounded-lg border border-line/70 bg-surface/50 p-0.5 xl:p-1">
            {COMMAND_LINKS.map((link) => (
              <CommandNavLink key={link.href} href={link.href} icon={link.icon} label={link.label} active={isOn(pathname, link.href)} />
            ))}
            <DropdownMenu label={t("nav.markets")} items={MARKETS} pathname={pathname} icon={<IconRadar className="w-[18px] h-[18px]" />} />
            <CommandNavLink href={academyLink.href} icon={academyLink.icon} label={academyLink.label} active={isOn(pathname, academyLink.href)} />
          </div>
          <Link href="/elite" className={`${elitePillClass} ms-1 xl:ms-2 px-2 lg:px-2.5 xl:px-3 py-1.5`} aria-label={eliteLabel} title={eliteLabel}>
            {"⚜"}
            <span className="hidden lg:inline">{" "}{eliteLabel}</span>
          </Link>
        </nav>

        <div className="hidden sm:flex items-center gap-2 shrink-0 ms-auto">{controls}</div>

        <div className="flex sm:hidden items-center gap-1.5 ms-auto">
          {isLoaded && isSignedIn && <NotificationBell />}
          <LanguageSelect />
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
            <div className="flex flex-col py-2">
              {COMMAND_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className={`px-2 py-2.5 text-sm transition-colors ${isOn(pathname, link.href) ? "text-text" : "text-text-muted hover:text-text"}`}>
                  {link.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => setMkOpen((v) => !v)}
                aria-expanded={mkOpen || mkActive}
                className={`flex w-full items-center justify-between px-2 py-2.5 text-sm transition-colors ${mkActive ? "text-text" : "text-text-muted hover:text-text"}`}
              >
                <span>{t("nav.markets")}</span>
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={`transition-transform ${mkOpen || mkActive ? "rotate-180" : ""}`}>
                  <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {(mkOpen || mkActive) && (
                <div className="ms-3 flex flex-col border-s border-line ps-2">
                  {MARKETS.map((item) => (
                    <Link key={item.href} href={item.href} className={`px-2 py-2 text-sm transition-colors ${isOn(pathname, item.href) ? "text-text" : "text-text-muted hover:text-text"}`}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
              <Link href={academyLink.href} className={`px-2 py-2.5 text-sm transition-colors ${isOn(pathname, academyLink.href) ? "text-text" : "text-text-muted hover:text-text"}`}>
                {academyLink.label}
              </Link>
              <InstallMenuButton className="px-2 py-2.5 text-start text-sm text-text-muted transition-colors hover:text-text" onAfter={() => setOpen(false)} />
            </div>
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
                <AccountMenu />
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
// NAV-ACADEMY-0017
// NAV-FIT-0035
