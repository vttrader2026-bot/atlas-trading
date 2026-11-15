import type { TradePlanDraft } from "@/lib/tradePlan";

/** Saved plans: "draft" (or none) and "entered" as before, plus "archived" (PHASE-3B). Entered and archived plans are not active. */
export type SavedPlanStatus = "draft" | "entered" | "archived";
export type SavedPlan = Omit<TradePlanDraft, "status"> & { id: string; createdAt: number; status?: SavedPlanStatus; archivedAt?: number };
