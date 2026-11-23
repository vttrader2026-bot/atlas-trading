// PHASE-3C: copy for DCA plan limits, Close and Restore. {n}, {limit} and {max} are filled in by the screen; the limits themselves
// always come from lib/entitlementConfig.ts through the server.

export const dcaLimitsFr: Record<string, string> = {
  activeCount: "Plans actifs : {n} sur {limit}",
  activeCountUnknown: "Plans actifs : {n}",
  close: "Clôturer le plan",
  restore: "Restaurer",
  closeConfirm: "Clôturer ce plan ? Son historique est conservé et vous pourrez le restaurer plus tard.",
  stateActive: "Actif",
  stateCompleted: "Terminé",
  stateClosed: "Clôturé",
  sectionClosed: "Plans clôturés et terminés",
  limitReached: "Vous avez atteint votre limite de {limit} plans DCA actifs. Clôturez ou terminez un plan pour en démarrer un nouveau.",
  limitElite: "ATLAS ELITE permet jusqu'à {max} plans DCA actifs.",
  overLimit: "Vous avez plus de plans DCA actifs que votre abonnement ne le permet. Vous pouvez toujours les gérer et les clôturer, mais pas en ajouter ni en restaurer tant que vous n'êtes pas sous la limite.",
  limit: "Vous avez atteint votre limite de plans DCA actifs, ce changement n'a donc pas été enregistré. Clôturez ou terminez d'abord un plan.",
  unverified: "Nous n'avons pas pu vérifier votre abonnement pour le moment. Rien n'a été enregistré. Veuillez réessayer dans un instant.",
};
