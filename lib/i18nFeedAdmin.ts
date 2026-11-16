// FEED-ADMIN-v1: dictionary for the owner-only signal controls on /trade-feed. Spread into the `feedAdmin` block of
// lib/i18n.tsx. English, French and Arabic must keep identical keys and {placeholders}.
type Dict = { [key: string]: string };

export const feedAdminEn: Dict = {
  edit: "Edit", status: "Update status", cancel: "Cancel signal", delete: "Delete signal",
  editTitle: "Edit signal", editSave: "Save changes", editNote: "Levels can only be edited while the signal is open and no member has confirmed it. Its audience cannot change.",
  pair: "Pair", timeframe: "Timeframe", entry: "Entry zone", stop: "Stop-loss", tp1: "TP1", tp2: "TP2", tp3: "TP3", reasoning: "Reasoning",
  statusTitle: "Update signal status", statusSave: "Update status", statusNote: "TP1 and TP2 are recorded and the signal stays open. TP3 and SL close it. The original levels are kept.",
  statusFreeNote: "This is a FREE signal: members with trade notifications on get a notification.", statusEliteNote: "This is an ELITE signal: only active ELITE members (and you) get a notification.", outcome: "Result", outTp: "{level} hit", outSl: "Stop-loss hit", note: "Note (optional)",
  cancelTitle: "Cancel this signal?", cancelConfirm: "Cancel signal", cancelNote: "The signal stays in the feed and in history, marked Cancelled. Use Delete only to remove it completely.", reason: "Reason (optional)",
  deleteTitle: "Delete this signal permanently?", deleteConfirm: "Delete permanently", deleteNote: "This removes the signal from the feed and cannot be undone. To keep its history, use Cancel signal instead.",
  back: "Keep it",
  edited: "Signal updated.", statusDone: "Status updated.", cancelled: "Signal cancelled.", deleted: "Signal deleted.",
  errGeneric: "Could not complete the action. Please try again.",
};

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
