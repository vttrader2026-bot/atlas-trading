"use client";

import Logo from "@/components/Logo";
import { useLanguage } from "@/lib/i18n";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-line mt-16">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <Logo />
          <p className="mt-2 text-xs text-text-muted max-w-xs leading-relaxed">
            {t("footer.disclaimer")}
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <a
            href="https://t.me/atlastradingcrypto"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm hover:text-gold transition-colors"
          >
            {t("footer.joinFree")}
          </a>
          <a
            href="https://t.me/Atlascryptotrader"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-muted hover:text-gold transition-colors"
          >
            {t("footer.contactVip")}
          </a>
        </div>
      </div>
    </footer>
  );
}
