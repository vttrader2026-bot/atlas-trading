"use client";
// USERNAME-v1: reminds users without a verified email to add one, so they can recover their password. Dismissible per session.
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";
import { shouldShowEmailNotice } from "@/lib/accountEmail";
import type { L3 } from "@/lib/studio";

const L = (en: string, ar: string, fr: string): L3 => ({ en, ar, fr });
const UI = {
  title: L("Add an email to protect your account", "أضف بريداً إلكترونياً لحماية حسابك", "Ajoutez un e-mail pour protéger votre compte"),
  body: L(
    "Your account has no verified email. If you forget your password, an email is the only way to recover it.",
    "حسابك لا يحتوي على بريد إلكتروني موثّق. إذا نسيت كلمة المرور فالبريد الإلكتروني هو الوسيلة الوحيدة لاستعادتها.",
    "Votre compte n'a pas d'e-mail vérifié. Si vous oubliez votre mot de passe, l'e-mail est le seul moyen de le récupérer.",
  ),
  cta: L("Add email", "إضافة بريد", "Ajouter un e-mail"),
  close: L("Dismiss", "إغلاق", "Fermer"),
};
const KEY = "atlas-trading.emailNoticeDismissed";

export default function EmailRecoveryNotice() {
  const { lang } = useLanguage();
  const { user, isSignedIn, isLoaded } = useUser();
  const { openUserProfile } = useClerk();
  const pathname = usePathname();
  // Renders nothing until Clerk has loaded on the client, so reading sessionStorage here cannot cause a hydration mismatch.
  const [dismissed, setDismissed] = useState(() => {
    try { return typeof window !== "undefined" && sessionStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  if (!isLoaded || dismissed || !shouldShowEmailNotice(user, !!isSignedIn, pathname)) return null;
  const dir = lang === "ar" ? "rtl" : "ltr";
  return (
    <div role="status" dir={dir} className="fixed bottom-4 start-4 end-4 z-40 mx-auto max-w-md rounded-xl border border-line bg-surface p-4 shadow-lg">
      <p className="text-sm font-semibold">{UI.title[lang]}</p>
      <p className="mt-1 text-xs text-text-muted">{UI.body[lang]}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => openUserProfile()} className="rounded-md bg-gold px-3 py-1.5 text-xs font-semibold text-black">{UI.cta[lang]}</button>
        <button
          type="button"
          onClick={() => { setDismissed(true); try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ } }}
          className="rounded-md border border-line px-3 py-1.5 text-xs"
        >{UI.close[lang]}</button>
      </div>
    </div>
  );
}
