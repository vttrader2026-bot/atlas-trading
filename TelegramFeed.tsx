"use client";

import { useLanguage } from "@/lib/i18n";

export default function TelegramFeed() {
  const { t } = useLanguage();

  return (
    <div className="border border-line rounded-lg overflow-hidden bg-surface">
      <div className="flex items-center justify-between px-4 h-11 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
          <span className="text-sm">{t("home.telegramFeed.title")}</span>
        </div>
        <a
          href="https://t.me/atlastradingcrypto"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-text-muted hover:text-gold transition-colors"
        >
          {t("home.telegramFeed.openInTelegram")}
        </a>
      </div>
      <iframe
        src="https://t.me/s/atlastradingcrypto"
        title="Atlas Trading Telegram feed"
        loading="lazy"
        className="w-full h-[520px] bg-white"
        style={{ colorScheme: "light" }}
      />
    </div>
  );
}
