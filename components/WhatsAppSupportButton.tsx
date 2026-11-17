"use client";
// WHATSAPP-SUPPORT-v1: the one global floating "Chat with us" button. Mounted once in app/layout.tsx, never on individual pages.
// Phones: icon only, lifted above the QuickNav bottom bar when that bar is showing. Desktop: icon + label.
// It hides itself while the install-app card is open (see globals.css) so the two never overlap.
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import { showQuickNav } from "@/lib/quickNav";
import { WHATSAPP_SUPPORT_URL } from "@/lib/whatsappSupport";
import { IconWhatsapp } from "@/components/home/brandIcons";

export default function WhatsAppSupportButton() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const lift = showQuickNav(pathname) ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-6" : "bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-6";
  return (
    <a
      href={WHATSAPP_SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("footer.whatsappAria")}
      className={`wa-fab fixed end-4 sm:end-6 ${lift} z-30 flex items-center gap-2 rounded-full shadow-lg transition-transform duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:border sm:border-line sm:bg-surface sm:pe-4 sm:hover:border-[#25D366]`}
    >
      <IconWhatsapp className="h-12 w-12 shrink-0" />
      <span className="hidden text-sm font-medium text-text sm:inline">{t("footer.chatWithUs")}</span>
    </a>
  );
}
