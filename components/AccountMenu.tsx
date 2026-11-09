"use client";

// Clerk's account menu with two extra entries: Notification settings and Language.
import { UserButton } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";
import LangFlag from "@/components/LangFlags";
import { LANGUAGES } from "@/components/LanguageSelect";

export default function AccountMenu() {
  const { lang, setLang, t } = useLanguage();
  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Link
          label={t("nav.notificationSettings")}
          labelIcon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
              <path d="M10 19a2 2 0 0 0 4 0" />
            </svg>
          }
          href="/account#notifications"
        />
        {LANGUAGES.map((l) => (
          <UserButton.Action
            key={l.code}
            label={`${t("nav.language")}: ${l.name}${l.code === lang ? " ✓" : ""}`}
            labelIcon={<LangFlag code={l.code} />}
            onClick={() => setLang(l.code)}
          />
        ))}
      </UserButton.MenuItems>
    </UserButton>
  );
}
