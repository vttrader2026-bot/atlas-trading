import type { TradePlanDraft } from "@/lib/tradePlan";

export type SavedPlan = TradePlanDraft & { id: string; createdAt: number };