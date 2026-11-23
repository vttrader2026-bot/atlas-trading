// OWNER-PUBLISH-v1: dictionary for the owner-only Publish to Feed dialog. Spread into the `pubFeed` block of lib/i18n.tsx.
// English, French and Arabic must keep identical keys and {placeholders}.
type Dict = { [key: string]: string };

export const pubFeedEn: Dict = {
  title: "Publish to Feed",
  body: "Choose who can see this signal. Check the levels below: once published, members can act on them.",
  audience: "Audience",
  free: "FREE",
  freeNote: "Visible to FREE and ELITE members.",
  elite: "ELITE",
  eliteNote: "Visible to active ELITE members and the owner. Everyone else sees a locked preview.",
  choose: "Choose FREE or ELITE to continue.",
  selected: "Selected audience: {tier}",
  confirm: "Publish to {tier}",
  cancel: "Cancel",
  publishing: "Publishing...",
  done: "Published to the feed for {tier}.",
  errDuplicate: "This setup was just published.",
  errInvalid: "The server rejected this setup: {reason}",
  errAuth: "Only the owner can publish.",
  errGeneric: "Couldn't publish. Please try again.",
  entry: "Entry",
  stop: "Stop-loss",
  targets: "Targets",
};
