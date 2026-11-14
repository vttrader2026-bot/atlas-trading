// QUICKNAV-v1: one global navigation list (desktop rail + mobile bottom bar). Pure data and rules, no UI. It only DISPLAYS
// links: access control stays where it was (proxy.ts redirects signed-out visitors away from private pages), and private
// destinations are additionally hidden here from signed-out visitors so they are never advertised to them.
import { isPrivatePath } from "@/lib/privateRoutes";

export type QuickItem = { key: string; href: string; labelKey: string; icon: "dashboard" | "feed" | "radar" | "pulse" | "analyzer" | "plan" | "journal" | "performance" | "investor" };

export const QUICK_ITEMS: readonly QuickItem[] = [
  { key: "dashboard", href: "/journal", labelKey: "nav.dashboard", icon: "dashboard" },
  { key: "feed", href: "/trade-feed", labelKey: "nav.tradeFeed", icon: "feed" },
  { key: "radar", href: "/radar", labelKey: "nav.radar", icon: "radar" },
  { key: "pulse", href: "/market-intelligence", labelKey: "nav.marketIntel", icon: "pulse" },
  { key: "analyzer", href: "/analyzer", labelKey: "nav.analyzer", icon: "analyzer" },
  { key: "plans", href: "/trade-plan", labelKey: "nav.tradePlan", icon: "plan" },
  // The Journal is the trade list on the Dashboard page: same route, anchored to it.
  { key: "journal", href: "/journal#trade-journal", labelKey: "nav.journal", icon: "journal" },
  { key: "performance", href: "/performance", labelKey: "nav.performance", icon: "performance" },
  { key: "investor", href: "/investor", labelKey: "nav.investor", icon: "investor" },
] as const;

/** Mobile bottom bar shows these directly; the rest sit behind "More". */
export const BOTTOM_KEYS = ["dashboard", "feed", "radar", "analyzer"] as const;

const basePath = (href: string) => href.split("#")[0];

/** Main platform pages. Marketing pages (home, academy, elite, share), auth and admin pages never get the navigation. */
const PLATFORM_PREFIXES = ["/journal", "/trade-feed", "/radar", "/market-intelligence", "/analyzer", "/trade-plan", "/investor", "/performance", "/watchlist", "/risk", "/workflow"] as const;
export const showQuickNav = (pathname: string | null | undefined): boolean =>
  !!pathname && PLATFORM_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** Items a visitor may be shown: private destinations only with a session. */
export const visibleItems = (signedIn: boolean): QuickItem[] => QUICK_ITEMS.filter((i) => signedIn || !isPrivatePath(basePath(i.href)));

const on = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Exactly one item is highlighted. /journal splits into Dashboard and Journal by the #trade-journal anchor. */
export function activeKey(pathname: string | null | undefined, hash = ""): string | null {
  if (!pathname) return null;
  if (on(pathname, "/journal")) return hash === "#trade-journal" ? "journal" : "dashboard";
  const hit = QUICK_ITEMS.find((i) => i.key !== "journal" && i.key !== "dashboard" && on(pathname, basePath(i.href)));
  return hit ? hit.key : null;
}
