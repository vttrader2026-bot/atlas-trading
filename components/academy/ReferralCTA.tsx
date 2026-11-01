"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";

// ATLAS-BINANCE-LESSON-v1
// Chrome strings live here (like the rest of the Academy) so lib/i18n.tsx stays untouched.
const CHROME = {
  cta: { en: "Create Binance Account", ar: "أنشئ حساب Binance", fr: "Créer un compte Binance" },
  codeLabel: { en: "Referral code", ar: "رمز الإحالة", fr: "Code de parrainage" },
  copy: { en: "Copy", ar: "نسخ", fr: "Copier" },
  copied: { en: "Copied", ar: "تم النسخ", fr: "Copié" },
  copyAria: { en: "Copy referral code", ar: "نسخ رمز الإحالة", fr: "Copier le code de parrainage" },
  disclosure: {
    en: "ATLAS TRADING may earn commissions from eligible referrals.",
    ar: "قد تحصل ATLAS TRADING على عمولات من الإحالات المؤهلة.",
    fr: "ATLAS TRADING peut percevoir des commissions sur les parrainages éligibles.",
  },
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers/contexts without the async clipboard API.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export default function ReferralCTA({ href, code, className }: { href: string; code: string; className?: string }) {
  const { lang } = useLanguage();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function onCopy() {
    if (!(await copyText(code))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={className ?? "mt-8 card card-accent p-5 sm:p-6"}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="btn-primary inline-flex w-full sm:w-auto items-center justify-center gap-1.5"
      >
        {CHROME.cta[lang]}
        <span aria-hidden>{lang === "ar" ? "↖" : "↗"}</span>
      </a>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-label text-text-muted">{CHROME.codeLabel[lang]}</span>
        <code
          dir="ltr"
          className="font-data text-base font-semibold tracking-wide rounded-md border border-line bg-surface-raised px-3 py-1.5"
        >
          {code}
        </code>
        <button
          type="button"
          onClick={onCopy}
          aria-label={CHROME.copyAria[lang]}
          className="px-4 py-1.5 rounded-md text-sm border border-line text-text-muted hover:text-text hover:border-gold transition-colors"
        >
          {copied ? `✓ ${CHROME.copied[lang]}` : CHROME.copy[lang]}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? CHROME.copied[lang] : ""}
        </span>
      </div>

      <p className="mt-4 text-xs text-text-muted leading-relaxed">{CHROME.disclosure[lang]}</p>
    </div>
  );
}
