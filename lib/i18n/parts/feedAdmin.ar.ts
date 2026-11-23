// FEED-ADMIN-v1: dictionary for the owner-only signal controls on /trade-feed. Spread into the `feedAdmin` block of
// lib/i18n.tsx. English, French and Arabic must keep identical keys and {placeholders}.
type Dict = { [key: string]: string };

export const feedAdminAr: Dict = {
  edit: "تعديل", status: "تحديث الحالة", cancel: "إلغاء الصفقة", delete: "حذف الصفقة",
  editTitle: "تعديل الصفقة", editSave: "حفظ التغييرات", editNote: "يمكن تعديل المستويات فقط ما دامت الصفقة مفتوحة ولم يؤكدها أي عضو. لا يمكن تغيير الجمهور.",
  pair: "الزوج", timeframe: "الإطار الزمني", entry: "منطقة الدخول", stop: "وقف الخسارة", tp1: "TP1", tp2: "TP2", tp3: "TP3", reasoning: "التحليل",
  statusTitle: "تحديث حالة الصفقة", statusSave: "تحديث الحالة", statusNote: "يتم تسجيل TP1 وTP2 وتبقى الصفقة مفتوحة، أما TP3 وSL فيغلقانها. تبقى المستويات الأصلية كما هي.",
  statusFreeNote: "هذه صفقة FREE: يصل إشعار للأعضاء الذين فعّلوا إشعارات الصفقات.", statusEliteNote: "هذه صفقة ELITE: يصل الإشعار فقط لأعضاء ELITE النشطين (ولك).", outcome: "النتيجة", outTp: "تحقق {level}", outSl: "ضُرب وقف الخسارة", note: "ملاحظة (اختياري)",
  cancelTitle: "إلغاء هذه الصفقة؟", cancelConfirm: "إلغاء الصفقة", cancelNote: "تبقى الصفقة في الخلاصة والسجل مع علامة ملغاة. استخدم الحذف فقط لإزالتها نهائيًا.", reason: "السبب (اختياري)",
  deleteTitle: "حذف هذه الصفقة نهائيًا؟", deleteConfirm: "حذف نهائي", deleteNote: "تُزال الصفقة من الخلاصة ولا يمكن التراجع. للاحتفاظ بسجلها استخدم إلغاء الصفقة.",
  back: "إبقاؤها",
  edited: "تم تحديث الصفقة.", statusDone: "تم تحديث الحالة.", cancelled: "تم إلغاء الصفقة.", deleted: "تم حذف الصفقة.",
  errGeneric: "تعذر تنفيذ الإجراء. حاول مرة أخرى.",
};
