import { checkLongPlan } from "@/lib/chartStructure";

/**
 * Spot-only server-side enforcement, independent of what the model says:
 * a "Short" can never reach the client, and a Long whose numbers don't make
 * sense against the real last close (invalidation not below price, targets
 * not above) is downgraded to Wait rather than shown as a trade idea.
 */
function firstNumber(text: string): number | null {
  const m = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const v = parseFloat(m[0]);
  return Number.isFinite(v) ? v : null;
}

export function enforceSpotPlan(parsed: Record<string, unknown>, lastClose: number | null): void {
  const plan = parsed.tradePlan as
    | { direction?: string; entryZone?: string; invalidation?: string; targets?: string[]; riskReward?: string }
    | undefined;
  if (!plan) return;
  const dir = (plan.direction || "").toLowerCase();
  const wait = "Wait — no clear setup";
  const downgrade = (reason: string) => {
    plan.direction = wait;
    plan.entryZone = "N/A";
    plan.invalidation = "N/A";
    plan.targets = [];
    plan.riskReward = "N/A";
    if (!parsed.noClearSetup) parsed.noClearSetup = reason;
  };
  if (dir.includes("short")) {
    downgrade("Atlas analyzes spot trades only — no suitable spot (buy) setup is identified on this chart.");
    return;
  }
  if (dir.includes("long") && lastClose !== null) {
    const invalidation = firstNumber(plan.invalidation || "");
    const targets = (plan.targets || []).map((t) => firstNumber(t));
    const check = checkLongPlan(lastClose, invalidation, targets);
    if (!check.ok) downgrade(`No suitable spot setup is identified: the proposed plan failed a consistency check (${check.reason}).`);
  }
}

// METHODOLOGY-0157
