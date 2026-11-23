// PHASE-3B: copy for Trade Plan limits and the Entered / Archived actions. {n} and {limit} are filled in by the page; the limit
// itself always comes from lib/entitlementConfig.ts through the server, never from this file.

export const planLimitsFr: Record<string, string> = {
  activeCount: "Plans actifs : {n} sur {limit}",
  activeCountUnknown: "Plans actifs : {n}",
  tabActive: "Actifs",
  tabEntered: "Entrés",
  tabArchived: "Archivés",
  chipEntered: "Entré",
  chipArchived: "Archivé",
  markEntered: "Marquer comme entré",
  archive: "Archiver",
  restore: "Restaurer",
  emptyTab: "Aucun plan ici.",
  limitReached: "Vous avez atteint votre limite de {limit} plans actifs. Marquez-en certains comme entrés ou archivez-les pour en enregistrer un nouveau.",
  limitElite: "ATLAS ELITE permet jusqu'à {n} plans actifs.",
  overLimit: "Vous avez plus de plans actifs que votre abonnement ne le permet. Vous pouvez toujours les gérer, mais pas en ajouter tant que vous n'êtes pas sous la limite.",
  unverified: "Nous n'avons pas pu vérifier votre abonnement pour le moment. Rien n'a été modifié. Veuillez réessayer dans un instant.",
  alreadySaved: "Ce plan est déjà enregistré.",
  actionError: "Impossible de mettre à jour le plan. Veuillez réessayer.",
};
