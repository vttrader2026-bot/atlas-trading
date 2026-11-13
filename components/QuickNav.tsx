"use client";
// QUICKNAV-v1: persistent sidebar rail (desktop) and bottom bar with a "More" sheet (mobile) for the main platform pages.
// The list, visibility and active-state rules live in lib/quickNav.ts. This is the only global quick navigation.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";
import { BOTTOM_KEYS, activeKey, showQuickNav, visibleItems, type QuickItem } from "@/lib/quickNav";
import { IconAnalyzer, IconJournal, IconMarketIntel, IconOverview, IconRadar, IconTradeFeed } from "@/components/icons";

const cls = "h-5 w-5";
function Icon({ name }: { name: QuickItem["icon"] }) {
  switch (name) {
    case "dashboard": return <IconOverview className={cls} />;
    case "feed": return <IconTradeFeed className={cls} />;
    case "radar": return <IconRadar className={cls} />;
    case "pulse": return <IconMarketIntel className={cls} />;
    case "analyzer": return <IconAnalyzer className={cls} />;
    case "journal": return <IconJournal className={cls} />;
    case "plan": return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden="true"><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4M10 12h6M10 16h6" /></svg>;
    default: return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9h-9V3Z" /><path d="M15.5 3.7A9 9 0 0 1 20.3 8.5h-4.8V3.7Z" /></svg>;
  }
}

function useNavState() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);
  return { pathname, items: visibleItems(!!isSignedIn), active: activeKey(pathname, hash) };
}

export default function QuickNav() {
  const { t } = useLanguage();
  const { pathname, items, active } = useNavState();
  // The "More" sheet belongs to the page it was opened on, so it closes by itself on navigation (no effect needed).
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const more = moreFor !== null && moreFor === pathname;
  if (!showQuickNav(pathname)) return null;
  const bottom = items.filter((i) => (BOTTOM_KEYS as readonly string[]).includes(i.key));
  const rest = items.filter((i) => !(BOTTOM_KEYS as readonly string[]).includes(i.key));
  const link = (i: QuickItem, base: string) => (
    <Link key={i.key} href={i.href} aria-current={active === i.key ? "page" : undefined} className={`${base} ${active === i.key ? "text-gold bg-gold/10" : "text-text-muted hover:text-text hover:bg-surface-raised"}`}>
      <Icon name={i.icon} /><span>{t(i.labelKey)}</span>
    </Link>
  );
  return (
    <>
      {/* Desktop rail: a sticky flex column next to the page, so it never covers content. */}
      <nav aria-label={t("quickNav.label")} className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[76px] shrink-0 flex-col items-stretch gap-1 overflow-y-auto border-e border-line px-1.5 py-4 lg:flex">
        {items.map((i) => link(i, "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[10px] font-medium leading-tight transition-colors"))}
      </nav>

      {/* Mobile bottom bar. */}
      <nav aria-label={t("quickNav.label")} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {bottom.map((i) => link(i, "flex flex-col items-center gap-0.5 px-1 py-2 text-center text-[10px] font-medium leading-tight"))}
          {rest.length > 0 && (
            <button type="button" aria-expanded={more} aria-controls="quicknav-more" onClick={() => setMoreFor(more ? null : pathname)} className={`flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium ${more || rest.some((i) => i.key === active) ? "text-gold" : "text-text-muted"}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={cls} aria-hidden="true"><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>
              <span>{t("quickNav.more")}</span>
            </button>
          )}
        </div>
        {more && (
          <div id="quicknav-more" className="border-t border-line bg-bg px-3 py-2">
            <div className="mx-auto grid max-w-lg grid-cols-2 gap-1">{rest.map((i) => link(i, "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium"))}</div>
          </div>
        )}
      </nav>
    </>
  );
}

/** Keeps the end of every platform page clear of the fixed bottom bar on phones. */
export function QuickNavSpacer() {
  const pathname = usePathname();
  return showQuickNav(pathname) ? <div aria-hidden className="h-16 lg:hidden" /> : null;
}
