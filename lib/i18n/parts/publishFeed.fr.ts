// OWNER-PUBLISH-v1: dictionary for the owner-only Publish to Feed dialog. Spread into the `pubFeed` block of lib/i18n.tsx.
// English, French and Arabic must keep identical keys and {placeholders}.
type Dict = { [key: string]: string };

export const pubFeedFr: Dict = {
  title: "Publier dans le fil",
  body: "Choisissez qui peut voir ce signal. Vérifiez les niveaux ci-dessous : une fois publié, les membres peuvent s'y fier.",
  audience: "Audience",
  free: "FREE",
  freeNote: "Visible par les membres FREE et ELITE.",
  elite: "ELITE",
  eliteNote: "Visible par les membres ELITE actifs et le propriétaire. Les autres voient un aperçu verrouillé.",
  choose: "Choisissez FREE ou ELITE pour continuer.",
  selected: "Audience choisie : {tier}",
  confirm: "Publier pour {tier}",
  cancel: "Annuler",
  publishing: "Publication...",
  done: "Publié dans le fil pour {tier}.",
  errDuplicate: "Ce setup vient d'être publié.",
  errInvalid: "Le serveur a refusé ce setup : {reason}",
  errAuth: "Seul le propriétaire peut publier.",
  errGeneric: "Impossible de publier. Veuillez réessayer.",
  entry: "Entrée",
  stop: "Stop-loss",
  targets: "Objectifs",
};
