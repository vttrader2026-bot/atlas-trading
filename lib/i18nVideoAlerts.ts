// VIDEO-ALERTS-v1: dictionary for the member-facing Video Alerts section on /account. Spread into the `videoAlerts` block of
// lib/i18n.tsx. English, French and Arabic keep identical keys and {placeholders}.
type Dict = { [key: string]: string };

export const videoAlertsEn: Dict = {
  title: "Video Alerts", note: "New videos from ATLAS TRADING. They stay here even if you were offline when the notification was sent.",
  empty: "No video announcements yet. New ones will appear here.", loading: "Loading...", loadError: "Could not load video alerts. Please try again.",
  retry: "Try again", watch: "Watch now", isNew: "New", unread: "{n} unread", allRead: "All caught up", markRead: "Mark as read", markAll: "Mark all as read",
  published: "Published {date}", saveError: "Could not save. Please try again.",
};
export const videoAlertsFr: Dict = {
  title: "Alertes vidéo", note: "Les nouvelles vidéos d'ATLAS TRADING. Elles restent ici même si vous étiez hors ligne lors de l'envoi de la notification.",
  empty: "Aucune annonce vidéo pour le moment. Les nouvelles apparaîtront ici.", loading: "Chargement...", loadError: "Impossible de charger les alertes vidéo. Veuillez réessayer.",
  retry: "Réessayer", watch: "Regarder", isNew: "Nouveau", unread: "{n} non lue(s)", allRead: "Tout est lu", markRead: "Marquer comme lu", markAll: "Tout marquer comme lu",
  published: "Publié le {date}", saveError: "Enregistrement impossible. Veuillez réessayer.",
};
export const videoAlertsAr: Dict = {
  title: "تنبيهات الفيديو", note: "أحدث فيديوهات ATLAS TRADING. تبقى هنا حتى لو كنت غير متصل عند إرسال الإشعار.",
  empty: "لا توجد إعلانات فيديو بعد. ستظهر الجديدة هنا.", loading: "جارٍ التحميل...", loadError: "تعذّر تحميل تنبيهات الفيديو. يرجى المحاولة مرة أخرى.",
  retry: "إعادة المحاولة", watch: "شاهد الآن", isNew: "جديد", unread: "{n} غير مقروء", allRead: "تمت قراءة كل شيء", markRead: "وضع علامة مقروء", markAll: "وضع علامة مقروء على الكل",
  published: "نُشر في {date}", saveError: "تعذّر الحفظ. يرجى المحاولة مرة أخرى.",
};
