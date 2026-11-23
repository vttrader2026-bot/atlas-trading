// PHASE-3B: copy for Trade Plan limits and the Entered / Archived actions. {n} and {limit} are filled in by the page; the limit
// itself always comes from lib/entitlementConfig.ts through the server, never from this file.

export const planLimitsAr: Record<string, string> = {
  activeCount: "الخطط النشطة: {n} من {limit}",
  activeCountUnknown: "الخطط النشطة: {n}",
  tabActive: "نشطة",
  tabEntered: "تم الدخول",
  tabArchived: "مؤرشفة",
  chipEntered: "تم الدخول",
  chipArchived: "مؤرشفة",
  markEntered: "تحديد كمنفَّذة",
  archive: "أرشفة",
  restore: "استعادة",
  emptyTab: "لا توجد خطط هنا.",
  limitReached: "لقد وصلت إلى الحد الأقصى وهو {limit} خطط نشطة. حدّد بعضها كمنفَّذة أو أرشفها لحفظ خطة جديدة.",
  limitElite: "تتيح عضوية ATLAS ELITE حتى {n} خطة نشطة.",
  overLimit: "لديك خطط نشطة أكثر مما تسمح به عضويتك. يمكنك إدارتها، لكن لا يمكنك إضافة خطط جديدة حتى تصبح أقل من الحد.",
  unverified: "تعذّر التحقق من عضويتك الآن. لم يتم تغيير أي شيء. يرجى المحاولة مرة أخرى بعد قليل.",
  alreadySaved: "هذه الخطة محفوظة بالفعل.",
  actionError: "تعذّر تحديث الخطة. يرجى المحاولة مرة أخرى.",
};
