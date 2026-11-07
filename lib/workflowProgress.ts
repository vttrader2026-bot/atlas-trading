// WORKFLOW-v1: real activity for the six-step workflow. Pure and derived only from saved data:
// the watchlist, local analysis history, the Trade Plan draft and Journal trades. Clicking a step,
// opening a page or saving a plan never counts as progress, and a plan is never an execution.
import { computeDashboard, statusOf, type Trade } from "@/lib/journal";

export type WorkflowInput = {
  /** null while unknown (signed out or still loading). */
  watchlistCount: number | null;
  analysisCount: number;
  hasPlanDraft: boolean;
  trades: Trade[];
};

export type WorkflowProgress = {
  watchlist: number | null;
  analyses: number;
  planInProgress: boolean;
  /** Trades recorded in the Journal = trades the trader confirmed they executed on an exchange. */
  executed: number;
  open: number;
  closed: number;
  winRate: number | null;
  realizedPnl: number;
};

export function computeWorkflowProgress(input: WorkflowInput): WorkflowProgress {
  const open = input.trades.filter((t) => statusOf(t) === "open").length;
  const closed = input.trades.filter((t) => statusOf(t) === "closed").length;
  const dash = computeDashboard(input.trades);
  return {
    watchlist: input.watchlistCount,
    analyses: Math.max(0, input.analysisCount),
    planInProgress: input.hasPlanDraft,
    executed: input.trades.length,
    open,
    closed,
    winRate: dash.winRate,
    realizedPnl: dash.realizedPnl,
  };
}
