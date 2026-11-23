// PHASE-3C: copy for DCA plan limits, Close and Restore. {n}, {limit} and {max} are filled in by the screen; the limits themselves
// always come from lib/entitlementConfig.ts through the server.

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
