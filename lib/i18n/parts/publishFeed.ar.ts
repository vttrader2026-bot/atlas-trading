// OWNER-PUBLISH-v1: dictionary for the owner-only Publish to Feed dialog. Spread into the `pubFeed` block of lib/i18n.tsx.
// English, French and Arabic must keep identical keys and {placeholders}.
type Dict = { [key: string]: string };

export const pubFeedAr: Dict = {
  title: "النشر في الخلاصة",
  body: "اختر من يمكنه رؤية هذه الإشارة. راجع المستويات أدناه: بعد النشر يمكن للأعضاء الاعتماد عليها.",
  audience: "الجمهور",
  free: "FREE",
  freeNote: "تظهر لأعضاء FREE وELITE.",
  elite: "ELITE",
  eliteNote: "تظهر لأعضاء ELITE النشطين والمالك فقط. الآخرون يرون معاينة مقفلة.",
  choose: "اختر FREE أو ELITE للمتابعة.",
  selected: "الجمهور المختار: {tier}",
  confirm: "نشر لـ {tier}",
  cancel: "إلغاء",
  publishing: "جارٍ النشر...",
  done: "تم النشر في الخلاصة لـ {tier}.",
  errDuplicate: "تم نشر هذه الصفقة للتو.",
  errInvalid: "رفض الخادم هذه الصفقة: {reason}",
  errAuth: "المالك فقط يمكنه النشر.",
  errGeneric: "تعذر النشر. حاول مرة أخرى.",
  entry: "الدخول",
  stop: "وقف الخسارة",
  targets: "الأهداف",
};
