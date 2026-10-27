"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import PromoCard from "@/components/share/PromoCard";
import {
  CARD_CONTENT,
  CARD_SECTIONS,
  CARD_SIZES,
  cardFileName,
  type CardLang,
  type CardSection,
  type CardSize,
  type CardStyle,
} from "@/lib/shareCards";

type L3 = { en: string; ar: string; fr: string };

// Page chrome lives here (like the Academy page) so lib/i18n.tsx stays untouched.
const C: Record<string, L3> = {
  title: { en: "Share Atlas", ar: "شارك أطلس", fr: "Partager Atlas" },
  subtitle: {
    en: "Download ready-made promo cards for Atlas tools and share them on TikTok, Telegram, Facebook or anywhere you post.",
    ar: "حمّل بطاقات ترويجية جاهزة لأدوات أطلس وشاركها على تيك توك وتيليجرام وفيسبوك أو أي مكان تنشر فيه.",
    fr: "Téléchargez des cartes promo prêtes à l'emploi pour les outils Atlas et partagez-les sur TikTok, Telegram, Facebook ou ailleurs.",
  },
  card: { en: "Card", ar: "البطاقة", fr: "Carte" },
  cardLang: { en: "Card language", ar: "لغة البطاقة", fr: "Langue de la carte" },
  cardStyle: { en: "Card style", ar: "نمط البطاقة", fr: "Style de la carte" },
  dark: { en: "Dark", ar: "داكن", fr: "Sombre" },
  light: { en: "Light", ar: "فاتح", fr: "Clair" },
  preview: { en: "Preview", ar: "معاينة", fr: "Aperçu" },
  download: { en: "Download", ar: "تحميل", fr: "Télécharger" },
  share: { en: "Share", ar: "مشاركة", fr: "Partager" },
  working: { en: "Preparing…", ar: "جارٍ التحضير…", fr: "Préparation…" },
  error: {
    en: "Couldn't create the image. Please try again.",
    ar: "تعذّر إنشاء الصورة. حاول مرة أخرى.",
    fr: "Impossible de créer l'image. Réessayez.",
  },
  tiktok: { en: "TikTok / Stories · 1080×1920", ar: "تيك توك / ستوري · 1080×1920", fr: "TikTok / Stories · 1080×1920" },
  square: { en: "Telegram / Facebook post · 1080×1080", ar: "منشور تيليجرام / فيسبوك · 1080×1080", fr: "Post Telegram / Facebook · 1080×1080" },
  link: { en: "Link preview · 1200×630", ar: "معاينة الرابط · 1200×630", fr: "Aperçu de lien · 1200×630" },
};

const SECTION_NAME: Record<CardSection, L3> = {
  marketIntel: { en: "Market Intelligence", ar: "ذكاء السوق", fr: "Market Intelligence" },
  analyzer: { en: "Analyzer", ar: "المحلل", fr: "Analyseur" },
  radar: { en: "Radar", ar: "الرادار", fr: "Radar" },
  academy: { en: "Academy", ar: "الأكاديمية", fr: "Académie" },
};

const SIZES: CardSize[] = ["tiktok", "square", "link"];

function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-md border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            value === o.value ? "bg-gold/15 text-gold" : "text-text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Shows a full-size card scaled down to the width of its container. */
function ScaledPreview({ size, children }: { size: CardSize; children: React.ReactNode }) {
  const { w, h } = CARD_SIZES[size];
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / w);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

  return (
    <div
      ref={box}
      dir="ltr"
      className="relative w-full overflow-hidden rounded-xl border border-line mx-auto"
      style={{ aspectRatio: `${w} / ${h}`, maxWidth: size === "tiktok" ? 340 : size === "square" ? 520 : 640 }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}

export default function SharePage() {
  const { lang } = useLanguage();
  const tr = (k: string) => C[k][lang];

  const [section, setSection] = useState<CardSection>("radar");
  const [cardLang, setCardLang] = useState<CardLang>("en");
  const [cardStyle, setCardStyle] = useState<CardStyle>("dark");
  const [previewSize, setPreviewSize] = useState<CardSize>("tiktok");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const refs = {
    tiktok: useRef<HTMLDivElement>(null),
    square: useRef<HTMLDivElement>(null),
    link: useRef<HTMLDivElement>(null),
  };

  useEffect(() => {
    try {
      const probe = new File([new Blob(["x"])], "x.png", { type: "image/png" });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanShare(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShare(false);
    }
  }, []);

  async function makeBlob(size: CardSize): Promise<Blob> {
    const node = refs[size].current;
    if (!node) throw new Error("card not mounted");
    const { w, h } = CARD_SIZES[size];

    // Make sure every face used by this card is actually loaded before the
    // browser rasterises it — otherwise Arabic falls back to a system font.
    const fam = getComputedStyle(node).fontFamily;
    const text = node.textContent || "";
    await document.fonts.ready;
    await Promise.all(
      ["500", "600", "700", "800"].map((wt) => document.fonts.load(`${wt} 40px ${fam}`, text).catch(() => []))
    );
    await document.fonts.ready;

    const { toBlob } = await import("html-to-image");
    const opts = { width: w, height: h, pixelRatio: 1, cacheBust: true, backgroundColor: undefined };
    // First pass warms font/image embedding (Safari renders it blank/fallback
    // the first time); the second is the one we keep.
    await toBlob(node, opts);
    const blob = await toBlob(node, opts);
    if (!blob) throw new Error("render failed");
    return blob;
  }

  async function run(size: CardSize, mode: "download" | "share") {
    if (busy) return;
    setBusy(`${mode}-${size}`);
    setError(false);
    try {
      const blob = await makeBlob(size);
      const name = cardFileName(section, size, cardLang);
      if (mode === "share") {
        const file = new File([blob], name, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            return;
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            // fall through to a normal download
          }
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      console.error("Share card export failed", err);
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  const content = CARD_CONTENT[section];

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{tr("title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-xl">{tr("subtitle")}</p>

      <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start">
        {/* CONTROLS */}
        <div className="space-y-5">
          <div>
            <div className="text-label text-text-muted mb-2">{tr("card")}</div>
            <Seg
              value={section}
              onChange={setSection}
              options={CARD_SECTIONS.map((s) => ({ value: s, label: SECTION_NAME[s][lang] }))}
            />
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-label text-text-muted mb-2">{tr("cardLang")}</div>
              <Seg
                value={cardLang}
                onChange={setCardLang}
                options={[
                  { value: "en", label: "English" },
                  { value: "ar", label: "العربية" },
                ]}
              />
            </div>
            <div>
              <div className="text-label text-text-muted mb-2">{tr("cardStyle")}</div>
              <Seg
                value={cardStyle}
                onChange={setCardStyle}
                options={[
                  { value: "dark", label: tr("dark") },
                  { value: "light", label: tr("light") },
                ]}
              />
            </div>
          </div>

          <div className="space-y-3">
            {SIZES.map((size) => (
              <div key={size} className="card p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-medium">{tr(size).split(" · ")[0]}</div>
                  <div className="text-xs text-text-muted font-data">{tr(size).split(" · ")[1]}</div>
                </div>
                <div className="flex gap-2">
                  {canShare && (
                    <button
                      type="button"
                      onClick={() => run(size, "share")}
                      disabled={!!busy}
                      className="px-3 py-1.5 rounded-md text-sm border border-line text-text-muted hover:text-text transition-colors disabled:opacity-50"
                    >
                      {busy === `share-${size}` ? tr("working") : tr("share")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => run(size, "download")}
                    disabled={!!busy}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {busy === `download-${size}` ? tr("working") : `${tr("download")} PNG`}
                  </button>
                </div>
              </div>
            ))}
            {error && <p className="text-sm text-bear">{tr("error")}</p>}
          </div>
        </div>

        {/* PREVIEW */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="text-label text-text-muted">{tr("preview")}</div>
            <Seg
              value={previewSize}
              onChange={setPreviewSize}
              options={SIZES.map((s) => ({ value: s, label: CARD_SIZES[s].w + "×" + CARD_SIZES[s].h }))}
            />
          </div>
          <ScaledPreview size={previewSize}>
            <PromoCard section={section} lang={cardLang} style={cardStyle} size={previewSize} />
          </ScaledPreview>
          <p className="mt-3 text-xs text-text-muted text-center">{content.label[cardLang]}</p>
        </div>
      </div>

      {/* Off-screen, exact-size cards: these are what get converted to PNG. */}
      <div aria-hidden="true" style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}>
        {SIZES.map((size) => (
          <PromoCard key={size} ref={refs[size]} section={section} lang={cardLang} style={cardStyle} size={size} />
        ))}
      </div>
    </main>
  );
}
