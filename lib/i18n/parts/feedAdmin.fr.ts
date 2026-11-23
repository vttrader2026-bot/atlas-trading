// FEED-ADMIN-v1: dictionary for the owner-only signal controls on /trade-feed. Spread into the `feedAdmin` block of
// lib/i18n.tsx. English, French and Arabic must keep identical keys and {placeholders}.
type Dict = { [key: string]: string };

export const feedAdminFr: Dict = {
  edit: "Modifier", status: "Mettre à jour le statut", cancel: "Annuler le signal", delete: "Supprimer le signal",
  editTitle: "Modifier le signal", editSave: "Enregistrer", editNote: "Les niveaux ne se modifient que tant que le signal est ouvert et qu'aucun membre ne l'a confirmé. Son audience ne peut pas changer.",
  pair: "Paire", timeframe: "Unité de temps", entry: "Zone d'entrée", stop: "Stop-loss", tp1: "TP1", tp2: "TP2", tp3: "TP3", reasoning: "Analyse",
  statusTitle: "Mettre à jour le statut du signal", statusSave: "Mettre à jour", statusNote: "TP1 et TP2 sont enregistrés et le signal reste ouvert. TP3 et SL le clôturent. Les niveaux d'origine sont conservés.",
  statusFreeNote: "Signal FREE : les membres qui ont activé les notifications de trades reçoivent une notification.", statusEliteNote: "Signal ELITE : seuls les membres ELITE actifs (et vous) reçoivent une notification.", outcome: "Résultat", outTp: "{level} atteint", outSl: "Stop-loss atteint", note: "Note (facultatif)",
  cancelTitle: "Annuler ce signal ?", cancelConfirm: "Annuler le signal", cancelNote: "Le signal reste dans le fil et dans l'historique, marqué Annulé. Utilisez Supprimer uniquement pour le retirer complètement.", reason: "Motif (facultatif)",
  deleteTitle: "Supprimer ce signal définitivement ?", deleteConfirm: "Supprimer définitivement", deleteNote: "Le signal est retiré du fil et ne peut pas être récupéré. Pour garder son historique, utilisez Annuler le signal.",
  back: "Le garder",
  edited: "Signal mis à jour.", statusDone: "Statut mis à jour.", cancelled: "Signal annulé.", deleted: "Signal supprimé.",
  errGeneric: "Action impossible. Veuillez réessayer.",
};
