// PHASE-3C: copy for DCA plan limits, Close and Restore. {n}, {limit} and {max} are filled in by the screen; the limits themselves
// always come from lib/entitlementConfig.ts through the server.

export const dcaLimitsEn: Record<string, string> = {
  activeCount: "Active plans: {n} of {limit}",
  activeCountUnknown: "Active plans: {n}",
  close: "Close plan",
  restore: "Restore",
  closeConfirm: "Close this plan? Its history is kept and you can restore it later.",
  stateActive: "Active",
  stateCompleted: "Completed",
  stateClosed: "Closed",
  sectionClosed: "Closed and completed plans",
  limitReached: "You have reached your limit of {limit} active DCA plans. Close or complete a plan to start a new one.",
  limitElite: "ATLAS ELITE allows up to {max} active DCA plans.",
  overLimit: "You have more active DCA plans than your membership allows. You can still manage and close them, but you cannot add or restore plans until you are under the limit.",
  limit: "You have reached your limit of active DCA plans, so this change was not saved. Close or complete a plan first.",
  unverified: "We could not verify your membership right now. Nothing was saved. Please try again in a moment.",
};
