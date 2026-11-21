"use client";
// WELCOME-v1: "What brings you to Atlas?" popup. Shown once to first-time visitors and to signed-in members with no saved interest, on the
// homepage and /workflow only. The choice is kept on this device and, when signed in, on the account (a choice made before sign-up is
// attached to the account afterwards). Never blocks any feature; "Maybe later" (or Esc / tapping outside) dismisses it for good.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";
import { INTERESTS, INTEREST_EVENT, RECOMMENDED, WELCOME_PATHS, normalizeInterest, readLocalInterest, writeLocalInterest, type Interest, type StoredInterest } from "@/lib/interest";
import type { L3 } from "@/lib/studio";

const L = (en: string, ar: string, fr: string): L3 => ({ en, ar, fr });
const UI = {
  title: L("What brings you to Atlas?", "ما الذي يجذبك إلى أطلس؟", "Qu'est-ce qui vous amène sur Atlas ?"),
  sub: L("Pick one and we'll point you to the most useful tools. Everything stays open to you.", "اختر واحداً وسنرشدك إلى الأدوات الأنسب. كل شيء يبقى متاحاً لك.", "Choisissez-en un et nous vous orienterons vers les outils les plus utiles. Tout reste accessible."),
  later: L("Maybe later", "ربما لاحقاً", "Plus tard"), close: L("Close", "إغلاق", "Fermer"),
  recTitle: L("Good places to start", "أماكن مناسبة للبدء", "Bons points de départ"), exploreDone: L("You'll see the full Atlas experience. You can change this any time from the footer.", "ستحصل على تجربة أطلس الكاملة. يمكنك التغيير في أي وقت من أسفل الصفحة.", "Vous verrez l'expérience Atlas complète. Vous pouvez modifier cela à tout moment depuis le pied de page."),
  recNote: L("You can change this any time from the footer.", "يمكنك التغيير في أي وقت من أسفل الصفحة.", "Vous pouvez modifier cela à tout moment depuis le pied de page."),
  done: L("Done", "تم", "Terminé"),
  opts: {
    spot: { t: L("Spot Trading", "التداول الفوري", "Trading spot"), d: L("Analyze markets and manage your trades.", "حلّل الأسواق وأدر صفقاتك.", "Analysez les marchés et gérez vos trades.") },
    invest: { t: L("Long-term Investment", "الاستثمار طويل الأجل", "Investissement long terme"), d: L("Research and track your investments.", "ابحث وتابع استثماراتك.", "Recherchez et suivez vos investissements.") },
    learn: { t: L("Learning", "التعلّم", "Apprentissage"), d: L("Learn cryptocurrency and technical analysis.", "تعلّم العملات الرقمية والتحليل الفني.", "Apprenez la crypto et l'analyse technique.") },
    explore: { t: L("Explore Everything", "استكشف كل شيء", "Tout explorer"), d: L("Discover all Atlas features.", "اكتشف جميع ميزات أطلس.", "Découvrez toutes les fonctions d'Atlas.") },
  } as Record<Interest, { t: L3; d: L3 }>,
};
const ICON: Record<Interest, string> = { spot: "📈", invest: "🏛️", learn: "🎓", explore: "🧭" };

async function saveRemote(body: { interest?: Interest; dismissed?: true }): Promise<void> {
  try {
    await fetch("/api/me/interest", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    /* the device copy still holds the choice; it is attached to the account on a later visit */
  }
}

export function WelcomeView({ lang, t, selected, step, onChoose, onLater, onDone, onLang, firstRef }: {
  lang: "en" | "ar" | "fr"; t: (k: string) => string; selected: Interest | null; step: "choose" | "done";
  onChoose: (i: Interest) => void; onLater: () => void; onDone: () => void; onLang?: (l: "en" | "fr" | "ar") => void; firstRef?: React.Ref<HTMLButtonElement>;
}) {
  const recs = selected ? RECOMMENDED[selected] : [];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" dir={lang === "ar" ? "rtl" : "ltr"} data-welcome
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onLater(); }}>
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-7">
        <button type="button" onClick={onLater} aria-label={UI.close[lang]} className="absolute end-3 top-3 rounded-md p-2 text-text-muted hover:text-text">✕</button>
        {onLang && (
          <div role="group" aria-label="Language" dir="ltr" data-welcome-lang className="mb-4 inline-flex gap-1 rounded-lg border border-line p-0.5">
            {(["en", "fr", "ar"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => onLang(l)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${lang === l ? "bg-gold/15 text-gold" : "text-text-muted hover:text-text"}`}>{l.toUpperCase()}</button>
            ))}
          </div>
        )}
        {step === "choose" ? (
          <>
            <h2 id="welcome-title" className="pe-8 text-xl font-bold tracking-tight sm:text-2xl">{UI.title[lang]}</h2>
            <p className="mt-2 text-sm text-text-muted">{UI.sub[lang]}</p>
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2" role="group" aria-label={UI.title[lang]}>
              {INTERESTS.map((i, idx) => (
                <button key={i} type="button" ref={idx === 0 ? firstRef : undefined} aria-pressed={selected === i} data-interest={i} onClick={() => onChoose(i)}
                  className={`rounded-xl border p-3.5 text-start transition-colors hover:border-gold/60 ${selected === i ? "border-gold/60 bg-gold/10" : "border-line bg-surface-raised"}`}>
                  <div className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden>{ICON[i]}</span>{UI.opts[i].t[lang]}</div>
                  <div className="mt-1 text-xs leading-relaxed text-text-muted">{UI.opts[i].d[lang]}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 text-center"><button type="button" onClick={onLater} className="text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">{UI.later[lang]}</button></div>
          </>
        ) : (
          <>
            <h2 id="welcome-title" className="pe-8 text-xl font-bold tracking-tight sm:text-2xl">{selected ? UI.opts[selected].t[lang] : UI.title[lang]}</h2>
            {recs.length > 0 ? (
              <>
                <p className="mt-2 text-sm text-text-muted">{UI.recTitle[lang]}</p>
                <ul className="mt-4 space-y-2">
                  {recs.map((r) => (
                    <li key={r.href}><Link href={r.href} onClick={onDone} className="flex items-center justify-between rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm font-medium transition-colors hover:border-gold/60"><span>{t(r.label)}</span><span aria-hidden className="text-gold rtl:rotate-180">→</span></Link></li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-text-muted">{UI.recNote[lang]}</p>
              </>
            ) : <p className="mt-2 text-sm text-text-muted">{UI.exploreDone[lang]}</p>}
            <div className="mt-5 text-center"><button type="button" onClick={onDone} className="btn-primary text-sm">{UI.done[lang]}</button></div>
          </>
        )}
      </div>
    </div>
  );
}

export default function WelcomePopup() {
  const { lang, t, setLang } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "done">("choose");
  const [selected, setSelected] = useState<Interest | null>(null);
  const synced = useRef(false);
  // If the sign-in service is slow or blocked, treat the visitor as signed out after a moment instead of never asking.
  const [waited, setWaited] = useState(false);
  useEffect(() => { const t = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(t); }, []);
  const ready = isLoaded || waited;
  const firstRef = useRef<HTMLButtonElement>(null);

  // Decide once the sign-in state is known, on the pages where the popup may appear by itself.
  useEffect(() => {
    if (!ready || !WELCOME_PATHS.includes(pathname)) return;
    let off = false, timer: ReturnType<typeof setTimeout> | undefined;
    const show = (cur: StoredInterest) => { timer = setTimeout(() => { if (!off) { setSelected(cur.interest); setStep("choose"); setOpen(true); } }, 1200); };
    (async () => {
      const local = readLocalInterest();
      if (!isSignedIn) { if (!local.interest && !local.dismissed) show(local); return; }
      let server: StoredInterest | null = null;
      if (!synced.current) {
        try {
          const r = await fetch("/api/me/interest", { cache: "no-store" });
          if (r.ok) server = normalizeInterest(await r.json());
        } catch { /* fall back to the device copy */ }
      }
      if (off) return;
      synced.current = true;
      if (server?.interest) { writeLocalInterest(server); return; }                // already chosen on the account
      if (local.interest) { if (server) void saveRemote({ interest: local.interest }); return; } // chosen as a visitor: attach it to the account
      if (local.dismissed || server?.dismissed) return;
      show(local);
    })();
    return () => { off = true; if (timer) clearTimeout(timer); };
  }, [ready, isSignedIn, pathname]);

  // "Personalize Atlas" in the footer reopens it with the current choice highlighted.
  useEffect(() => {
    const reopen = () => { setSelected(readLocalInterest().interest); setStep("choose"); setOpen(true); };
    window.addEventListener(INTEREST_EVENT, reopen);
    return () => window.removeEventListener(INTEREST_EVENT, reopen);
  }, []);

  const later = useCallback(() => {
    setOpen(false);
    if (!readLocalInterest().interest) { writeLocalInterest({ interest: null, dismissed: true }); if (isSignedIn) void saveRemote({ dismissed: true }); }
  }, [isSignedIn]);
  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") later(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, later]);

  if (!open) return null;
  const choose = (i: Interest) => { setSelected(i); writeLocalInterest({ interest: i, dismissed: false }); if (isSignedIn) void saveRemote({ interest: i }); setStep("done"); };
  return <WelcomeView lang={lang} t={t} selected={selected} step={step} onChoose={choose} onLater={later} onDone={() => setOpen(false)} onLang={setLang} firstRef={firstRef} />;
}
