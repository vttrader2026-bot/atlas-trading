// FEED-ADMIN-v1: dictionary for the owner-only signal controls on /trade-feed. Spread into the `feedAdmin` block of
// lib/i18n.tsx. English, French and Arabic must keep identical keys and {placeholders}.
type Dict = { [key: string]: string };

export const feedAdminEn: Dict = {
  edit: "Edit", status: "Update status", cancel: "Cancel signal", delete: "Delete signal",
  editTitle: "Edit signal", editSave: "Save changes", editNote: "Levels can only be edited while the signal is open and no member has confirmed it. Its audience cannot change.",
  pair: "Pair", timeframe: "Timeframe", entry: "Entry zone", stop: "Stop-loss", tp1: "TP1", tp2: "TP2", tp3: "TP3", reasoning: "Reasoning",
  statusTitle: "Update signal status", statusSave: "Update status", statusNote: "TP1 and TP2 are recorded and the signal stays open. TP3 and SL close it. The original levels are kept.",
  statusFreeNote: "This is a FREE signal: members with trade notifications on get a notification.", statusEliteNote: "This is an ELITE signal: only active ELITE members (and you) get a notification.", outcome: "Result", outTp: "{level} hit", outSl: "Stop-loss hit", note: "Note (optional)",
  cancelTitle: "Cancel this signal?", cancelConfirm: "Cancel signal", cancelNote: "The signal stays in the feed and in history, marked Cancelled. Use Delete only to remove it completely.", reason: "Reason (optional)",
  deleteTitle: "Delete this signal permanently?", deleteConfirm: "Delete permanently", deleteNote: "This removes the signal from the feed and cannot be undone. To keep its history, use Cancel signal instead.",
  back: "Keep it",
  edited: "Signal updated.", statusDone: "Status updated.", cancelled: "Signal cancelled.", deleted: "Signal deleted.",
  errGeneric: "Could not complete the action. Please try again.",
};
