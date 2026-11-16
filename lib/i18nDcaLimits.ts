// PHASE-3C: copy for DCA plan limits, Close and Restore. {n}, {limit} and {max} are filled in by the screen; the limits themselves
// always come from lib/entitlementConfig.ts through the server.
export const dcaLimitsEn: Record<string, string> = {
  activeCount: "Active plans: {n} of {limit}",
  activeCountUnknown: "Active plans: {n}",
  close: "Close plan",
  restore: "Restore",
  closeConfirm: "Close this plan? Its history is kept and you can restore it later.",
  stateActive: "Active",
  stateCompleted: "Completed",
  stateClosed: "Closed",
  sectionClosed: "Closed and completed plans",
  limitReached: "You have reached your limit of {limit} active DCA plans. Close or complete a plan to start a new one.",
  limitElite: "ATLAS ELITE allows up to {max} active DCA plans.",
  overLimit: "You have more active DCA plans than your membership allows. You can still manage and close them, but you cannot add or restore plans until you are under the limit.",
  limit: "You have reached your limit of active DCA plans, so this change was not saved. Close or complete a plan first.",
  unverified: "We could not verify your membership right now. Nothing was saved. Please try again in a moment.",
};

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

export const dcaLimitsAr: Record<string, string> = {
  activeCount: "الخطط النشطة: {n} من {limit}",
  activeCountUnknown: "الخطط النشطة: {n}",
  close: "إغلاق الخطة",
  restore: "استعادة",
  closeConfirm: "هل تريد إغلاق هذه الخطة؟ يبقى سجلها محفوظًا ويمكنك استعادتها لاحقًا.",
  stateActive: "نشطة",
  stateCompleted: "مكتملة",
  stateClosed: "مغلقة",
  sectionClosed: "الخطط المغلقة والمكتملة",
  limitReached: "لقد وصلت إلى الحد الأقصى وهو {limit} خطط DCA نشطة. أغلق خطة أو أكملها لبدء خطة جديدة.",
  limitElite: "تتيح عضوية ATLAS ELITE حتى {max} خطة DCA نشطة.",
  overLimit: "لديك خطط DCA نشطة أكثر مما تسمح به عضويتك. يمكنك إدارتها وإغلاقها، لكن لا يمكنك إضافة خطط أو استعادتها حتى تصبح أقل من الحد.",
  limit: "وصلت إلى الحد الأقصى لخطط DCA النشطة، لذلك لم يتم حفظ هذا التغيير. أغلق خطة أو أكملها أولًا.",
  unverified: "تعذّر التحقق من عضويتك الآن. لم يتم حفظ أي شيء. يرجى المحاولة مرة أخرى بعد قليل.",
};
