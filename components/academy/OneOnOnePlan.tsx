"use client";
// ACADEMY-1ON1-v1: the 1-on-1 coaching plan. Payment and enrollment happen on WhatsApp ONLY: the single CTA opens the
// existing Atlas WhatsApp link passed in by the Academy page (no number or link is invented here, no other payment option).
import { useLanguage, type Lang } from "@/lib/i18n";

export const ONE_ON_ONE_PRICE = { usdt: 50, mru: 800 } as const;

const COPY: Record<Lang, {
  badge: string; title: string; sub: string; curTitle: string; cur: string[]; priceTitle: string; usdt: string; mru: string;
  payNote: string; stepsTitle: string; steps: string[]; cta: string; ctaNote: string;
}> = {
  en: {
    badge: "1-on-1 coaching", title: "Atlas Academy 1-on-1 Plan",
    sub: "Personal coaching with Atlas, built around the core skills every spot trader needs.",
    curTitle: "What you will learn",
    cur: ["Crypto trading basics", "Technical analysis", "Chart reading and market structure", "Risk management and trade planning"],
    priceTitle: "Price", usdt: "USDT", mru: "MRU",
    payNote: "Payment is arranged on WhatsApp only. There are no other payment options for this plan.",
    stepsTitle: "How enrollment works",
    steps: ["Tap Enroll Now to open WhatsApp.", "Tell us you want the 1-on-1 plan and agree on your start.", "Complete payment with us on WhatsApp.", "Begin your sessions."],
    cta: "Enroll Now", ctaNote: "Opens the Atlas WhatsApp contact in a new tab.",
  },
  ar: {
    badge: "تدريب فردي", title: "خطة أكاديمية أطلس الفردية",
    sub: "تدريب شخصي مع أطلس، مبني على المهارات الأساسية التي يحتاجها كل متداول فوري.",
    curTitle: "ماذا ستتعلم",
    cur: ["أساسيات تداول العملات الرقمية", "التحليل الفني", "قراءة الشارت وهيكل السوق", "إدارة المخاطر وتخطيط الصفقات"],
    priceTitle: "السعر", usdt: "USDT", mru: "أوقية",
    payNote: "يتم ترتيب الدفع عبر واتساب فقط. لا توجد وسائل دفع أخرى لهذه الخطة.",
    stepsTitle: "كيف يتم التسجيل",
    steps: ["اضغط «سجّل الآن» لفتح واتساب.", "أخبرنا أنك تريد الخطة الفردية واتفق معنا على موعد البدء.", "أكمل الدفع معنا عبر واتساب.", "ابدأ جلساتك."],
    cta: "سجّل الآن", ctaNote: "يفتح جهة اتصال أطلس على واتساب في تبويب جديد.",
  },
  fr: {
    badge: "Coaching individuel", title: "Plan individuel Atlas Academy",
    sub: "Un coaching personnel avec Atlas, centré sur les compétences essentielles de tout trader spot.",
    curTitle: "Ce que vous allez apprendre",
    cur: ["Les bases du trading crypto", "L'analyse technique", "La lecture des graphiques et la structure du marché", "La gestion du risque et la planification des trades"],
    priceTitle: "Prix", usdt: "USDT", mru: "MRU",
    payNote: "Le paiement s'organise uniquement sur WhatsApp. Aucun autre moyen de paiement n'est proposé pour ce plan.",
    stepsTitle: "Comment s'inscrire",
    steps: ["Touchez S'inscrire pour ouvrir WhatsApp.", "Dites-nous que vous voulez le plan individuel et convenez du début.", "Finalisez le paiement avec nous sur WhatsApp.", "Commencez vos séances."],
    cta: "S'inscrire", ctaNote: "Ouvre le contact WhatsApp d'Atlas dans un nouvel onglet.",
  },
};

export default function OneOnOnePlan({ whatsappUrl }: { whatsappUrl: string }) {
  const { lang } = useLanguage();
  const c = COPY[lang];
  return (
    <section id="one-on-one" className="mt-10 rounded-2xl border border-gold/40 bg-gradient-to-b from-surface-raised to-surface p-5 sm:p-7" aria-labelledby="one-on-one-title">
      <span className="inline-flex rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gold">{c.badge}</span>
      <h2 id="one-on-one-title" className="mt-3 font-heading text-xl sm:text-2xl font-bold tracking-tight">{c.title}</h2>
      <p className="mt-1.5 max-w-xl text-sm text-text-muted leading-relaxed">{c.sub}</p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="text-label text-gold">{c.curTitle}</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {c.cur.map((x) => <li key={x} className="flex gap-2"><span aria-hidden className="text-gold">✓</span><span>{x}</span></li>)}
          </ul>
        </div>
        <div>
          <h3 className="text-label text-gold">{c.priceTitle}</h3>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1" dir="ltr">
            <span className="font-data text-3xl font-bold">${ONE_ON_ONE_PRICE.usdt}</span><span className="text-sm text-text-muted">{c.usdt}</span>
            <span className="text-text-muted">/</span>
            <span className="font-data text-2xl font-bold">{ONE_ON_ONE_PRICE.mru}</span><span className="text-sm text-text-muted">{c.mru}</span>
          </div>
          <p className="mt-2 text-xs text-text-muted leading-relaxed">{c.payNote}</p>
        </div>
      </div>

      <h3 className="mt-5 text-label text-gold">{c.stepsTitle}</h3>
      <ol className="mt-2 space-y-1.5 text-sm">
        {c.steps.map((x, i) => <li key={x} className="flex gap-2.5"><span className="font-data text-gold" dir="ltr">{i + 1}.</span><span>{x}</span></li>)}
      </ol>

      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-primary mt-6 inline-flex items-center gap-1.5">
        {c.cta}<span aria-hidden>{"→"}</span>
      </a>
      <p className="mt-2 text-xs text-text-muted">{c.ctaNote}</p>
    </section>
  );
}
