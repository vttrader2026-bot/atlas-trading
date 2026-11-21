// WELCOME-v1: the "What brings you to Atlas?" personalization. Pure helpers shared by the popup and the API.
// The choice only drives which existing features are suggested; it never limits access to anything.
export type Interest = "spot" | "invest" | "learn" | "explore";
export const INTERESTS: Interest[] = ["spot", "invest", "learn", "explore"];
export const isInterest = (v: unknown): v is Interest => typeof v === "string" && (INTERESTS as string[]).includes(v);

/** Suggested existing features per interest (labels come from the site's own nav strings). "explore" suggests nothing: normal experience. */
export const RECOMMENDED: Record<Interest, { href: string; label: string; primary?: boolean }[]> = {
  spot: [{ href: "/analyzer", label: "nav.analyzer" }, { href: "/radar", label: "nav.radar" }, { href: "/trade-plan", label: "nav.tradePlan" }],
  invest: [{ href: "/market-intelligence", label: "nav.marketIntel" }, { href: "/investor", label: "investor.footerLink" }],
  learn: [{ href: "/academy", label: "welcome.academy", primary: true }, { href: "/videos", label: "welcome.videos" }], // "welcome.*" labels are defined by the popup itself
  explore: [],
};

export type StoredInterest = { interest: Interest | null; dismissed: boolean };
export const EMPTY_INTEREST: StoredInterest = { interest: null, dismissed: false };
export const INTEREST_STORAGE_KEY = "atlas-trading.interest";
export const INTEREST_EVENT = "atlas:personalize"; // fired by the footer link to reopen the popup
/** Pages where the popup may appear on its own: the homepage and where new members land after sign-up. */
export const WELCOME_PATHS = ["/", "/workflow"];

export function normalizeInterest(raw: unknown): StoredInterest {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const interest = isInterest(o.interest) ? o.interest : null;
  return { interest, dismissed: interest ? false : o.dismissed === true };
}
export function readLocalInterest(): StoredInterest {
  try {
    const s = window.localStorage.getItem(INTEREST_STORAGE_KEY);
    return s ? normalizeInterest(JSON.parse(s)) : EMPTY_INTEREST;
  } catch {
    return EMPTY_INTEREST;
  }
}
export function writeLocalInterest(v: StoredInterest): void {
  try {
    window.localStorage.setItem(INTEREST_STORAGE_KEY, JSON.stringify(normalizeInterest(v)));
  } catch {
    /* storage unavailable (private mode): the choice just isn't remembered on this device */
  }
}
