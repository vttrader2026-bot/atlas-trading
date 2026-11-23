// PHASE-3B: copy for Trade Plan limits and the Entered / Archived actions. {n} and {limit} are filled in by the page; the limit
// itself always comes from lib/entitlementConfig.ts through the server, never from this file.

export const planLimitsEn: Record<string, string> = {
  activeCount: "Active plans: {n} of {limit}",
  activeCountUnknown: "Active plans: {n}",
  tabActive: "Active",
  tabEntered: "Entered",
  tabArchived: "Archived",
  chipEntered: "Entered",
  chipArchived: "Archived",
  markEntered: "Mark entered",
  archive: "Archive",
  restore: "Restore",
  emptyTab: "No plans here.",
  limitReached: "You have reached your limit of {limit} active plans. Mark some as Entered or archive them to save a new one.",
  limitElite: "ATLAS ELITE allows up to {n} active plans.",
  overLimit: "You have more active plans than your membership allows. You can still manage them, but you cannot add new ones until you are under the limit.",
  unverified: "We could not verify your membership right now. Nothing was changed. Please try again in a moment.",
  alreadySaved: "This plan is already saved.",
  actionError: "Could not update the plan. Please try again.",
};
