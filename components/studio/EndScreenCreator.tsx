"use client";
// END-SCREEN-v1: simple End Screen Creator inside the Social Media Studio. Static promo images for the end of TikTok videos and other
// content: size presets + custom, live preview, editable text, logo + URL, colors, sizes, alignment, templates, PNG/JPEG export at
// the exact resolution. Uses the Studio's own export pipeline (renderStudioPng); nothing leaves the browser.
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { describeExportError, renderStudioPng } from "@/lib/studioExport";
import EndScreenCanvas from "@/components/studio/EndScreenCanvas";
import { END_SIZES, END_TEMPLATES, SIZE_IDS, clampDim, clampScale, endFileName, sizeOf, templateOf, type Align, type EndSpec, type EndTemplateId, type ImgFmt, type SizeId } from "@/lib/endScreen";
import type { L3, Lang } from "@/lib/studio";

const L = (en: string, ar: string, fr: string): L3 => ({ en, ar, fr });
const UI = {
  intro: L("Create a static end-screen image for the end of your TikTok videos and other content.", "أنشئ صورة ختامية ثابتة لنهاية فيديوهات تيك توك ومحتواك الآخر.", "Créez une image de fin statique pour la fin de vos vidéos TikTok et autres contenus."),
  template: L("Template", "القالب", "Modèle"), size: L("Canvas size", "حجم اللوحة", "Taille du canevas"), custom: L("Custom", "مخصص", "Perso"),
  width: L("Width (px)", "العرض (بكسل)", "Largeur (px)"), height: L("Height (px)", "الارتفاع (بكسل)", "Hauteur (px)"),
  language: L("Image language", "لغة الصورة", "Langue de l'image"), text: L("Text", "النص", "Texte"),
  headline: L("Headline", "العنوان", "Titre"), subtitle: L("Subtitle", "العنوان الفرعي", "Sous-titre"), cta: L("Button text (CTA)", "نص الزر", "Texte du bouton"),
  logo: L("Show Atlas logo", "إظهار شعار أطلس", "Afficher le logo Atlas"), showUrl: L("Show website URL", "إظهار رابط الموقع", "Afficher l'URL"), url: L("Website URL", "رابط الموقع", "URL du site"),
  colors: L("Colors", "الألوان", "Couleurs"), bg1: L("Background", "الخلفية", "Arrière-plan"), bg2: L("Background 2", "الخلفية 2", "Arrière-plan 2"), textColor: L("Text", "النص", "Texte"), accent: L("Button", "الزر", "Bouton"), ctaText: L("Button text", "نص الزر", "Texte bouton"),
  fonts: L("Font sizes", "أحجام الخطوط", "Tailles de police"), head: L("Headline", "العنوان", "Titre"), sub: L("Subtitle", "الفرعي", "Sous-titre"), btn: L("Button", "الزر", "Bouton"),
  align: L("Alignment", "المحاذاة", "Alignement"), start: L("Start", "البداية", "Début"), center: L("Center", "الوسط", "Centre"), end: L("End", "النهاية", "Fin"),
  preview: L("Preview", "معاينة", "Aperçu"), png: L("Download PNG", "تنزيل PNG", "Télécharger PNG"), jpeg: L("Download JPEG", "تنزيل JPEG", "Télécharger JPEG"),
  working: L("Working…", "جارٍ…", "En cours…"), error: L("Could not create the image. Please try again.", "تعذر إنشاء الصورة. حاول مرة أخرى.", "Impossible de créer l'image. Réessayez."),
  note: L("Files are exported at the exact pixel size shown.", "تُصدَّر الملفات بالحجم الدقيق بالبكسل المعروض.", "Les fichiers sont exportés à la taille exacte en pixels indiquée."),
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={`rounded-md border px-2.5 py-1.5 text-xs sm:text-sm transition-colors ${o.value === value ? "border-gold/60 bg-gold/15 text-gold" : "border-line text-text-muted hover:text-text"}`}>{o.label}</button>
      ))}
    </div>
  );
}
const Color = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <label className="flex items-center gap-2 text-xs text-text-muted">
    <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" />{label}
  </label>
);
const Range = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
  <label className="flex items-center gap-2 text-xs text-text-muted">
    <span className="w-16 shrink-0">{label}</span>
    <input type="range" min={50} max={200} value={value} onChange={(e) => onChange(clampScale(e.target.value))} className="min-w-0 flex-1 accent-[var(--gold)]" />
    <span className="w-10 text-end font-data" dir="ltr">{value}%</span>
  </label>
);

export default function EndScreenCreator() {
  const { lang: siteLang } = useLanguage();
  const tr = (k: keyof typeof UI) => UI[k][siteLang];
  const [tpl, setTpl] = useState<EndTemplateId>("watch");
  const [lang, setLang] = useState<Lang>("en");
  const [size, setSize] = useState<SizeId>("story");
  const [custom, setCustom] = useState({ w: "1080", h: "1080" });
  const [edits, setEdits] = useState<Record<string, { h?: string; s?: string; c?: string }>>({});
  const [colors, setColors] = useState(templateOf("watch").colors);
  const [align, setAlign] = useState<Align>("center");
  const [scales, setScales] = useState({ head: 100, sub: 100, cta: 100 });
  const [showLogo, setShowLogo] = useState(true);
  const [showUrl, setShowUrl] = useState(true);
  const [url, setUrl] = useState("atlastrading.app");
  const [busy, setBusy] = useState<ImgFmt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const t = templateOf(tpl);
  const key = `${tpl}:${lang}`;
  const { w, h } = sizeOf(size, { w: Number(custom.w), h: Number(custom.h) });
  const spec: EndSpec = {
    w, h, lang, headline: edits[key]?.h ?? t.headline[lang], subtitle: edits[key]?.s ?? t.subtitle[lang], cta: edits[key]?.c ?? t.cta[lang],
    url, showLogo, showUrl, ...colors, align, headScale: scales.head, subScale: scales.sub, ctaScale: scales.cta,
  };
  const setEdit = (p: { h?: string; s?: string; c?: string }) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...p } }));
  const pickTemplate = (id: EndTemplateId) => { setTpl(id); setColors(templateOf(id).colors); };

  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / w));
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  const ratio = w / h;
  const maxW = ratio < 0.7 ? 340 : ratio > 1.3 ? 640 : 460;

  async function exportAs(fmt: ImgFmt) {
    if (busy) return;
    setBusy(fmt); setError(null); setExporting(true);
    try {
      await sleep(600); // the hidden full-size canvas mounts and fonts load
      const png = await renderStudioPng(exportRef.current, w, h);
      let blob = png;
      if (fmt === "jpeg") {
        const bmp = await createImageBitmap(png);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
        const j = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.95));
        if (!j) throw new Error("JPEG export failed");
        blob = j;
      }
      const a = document.createElement("a");
      const u = URL.createObjectURL(blob);
      a.href = u; a.download = endFileName(tpl, w, h, lang, fmt);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 10_000);
    } catch (err) {
      console.error("End screen export failed", err);
      setError(describeExportError(err));
    } finally {
      setExporting(false); setBusy(null);
    }
  }

  const input = "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-text focus:border-gold/60 focus:outline-none";
  const lbl = "text-label text-text-muted mb-2";
  const dimInput = (k: "w" | "h", label: string) => (
    <label className="block text-xs text-text-muted">{label}
      <input inputMode="numeric" dir="ltr" className={`${input} mt-1 w-28`} value={custom[k]} onChange={(e) => setCustom((c) => ({ ...c, [k]: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
        onBlur={() => setCustom((c) => ({ ...c, [k]: String(clampDim(c[k])) }))} />
    </label>
  );

  return (
    <div data-end-screen>
      <p className="max-w-2xl text-sm text-text-muted">{tr("intro")}</p>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="lg:order-2 lg:sticky lg:top-20">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-label text-text-muted">{tr("preview")}</div>
            <div className="font-data text-xs text-text-muted" dir="ltr">{w}×{h}</div>
          </div>
          <div ref={box} dir="ltr" data-endscreen-preview className="relative mx-auto w-full overflow-hidden rounded-xl border border-line" style={{ aspectRatio: `${w} / ${h}`, maxWidth: maxW }}>
            <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}><EndScreenCanvas spec={spec} /></div>
          </div>
          <div className="mx-auto mt-4 flex max-w-[460px] flex-wrap justify-center gap-2">
            <button type="button" onClick={() => exportAs("png")} disabled={!!busy} className="btn-primary text-sm disabled:opacity-50">{busy === "png" ? tr("working") : tr("png")}</button>
            <button type="button" onClick={() => exportAs("jpeg")} disabled={!!busy} className="rounded-md border border-line px-3 py-2 text-sm text-text-muted transition-colors hover:text-text disabled:opacity-50">{busy === "jpeg" ? tr("working") : tr("jpeg")}</button>
          </div>
          <p className="mt-2 text-center text-xs text-text-muted">{tr("note")}</p>
          {error && (
            <div role="alert" className="mt-2 text-center text-sm text-bear"><p>{tr("error")}</p><p dir="ltr" className="mt-1 break-words font-data text-xs opacity-80">{error}</p></div>
          )}
        </div>

        <div className="space-y-6 lg:order-1">
          <div>
            <div className={lbl}>{tr("template")}</div>
            <Seg label={tr("template")} value={tpl} onChange={pickTemplate} options={END_TEMPLATES.map((x) => ({ value: x.id, label: x.name[siteLang] }))} />
          </div>
          <div>
            <div className={lbl}>{tr("size")}</div>
            <Seg label={tr("size")} value={size} onChange={setSize} options={SIZE_IDS.map((s) => ({ value: s, label: s === "custom" ? tr("custom") : END_SIZES[s].ratio }))} />
            {size === "custom" && <div className="mt-3 flex gap-3">{dimInput("w", tr("width"))}{dimInput("h", tr("height"))}</div>}
          </div>
          <div>
            <div className={lbl}>{tr("language")}</div>
            <Seg label={tr("language")} value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }, { value: "fr", label: "Français" }]} />
          </div>
          <div>
            <div className={lbl}>{tr("text")}</div>
            <label className="block text-xs text-text-muted">{tr("headline")}<input className={`${input} mt-1`} dir="auto" maxLength={80} value={spec.headline} onChange={(e) => setEdit({ h: e.target.value })} /></label>
            <label className="mt-3 block text-xs text-text-muted">{tr("subtitle")}<textarea className={`${input} mt-1 min-h-[72px]`} dir="auto" maxLength={160} value={spec.subtitle} onChange={(e) => setEdit({ s: e.target.value })} /></label>
            <label className="mt-3 block text-xs text-text-muted">{tr("cta")}<input className={`${input} mt-1`} dir="auto" maxLength={40} value={spec.cta} onChange={(e) => setEdit({ c: e.target.value })} /></label>
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-text-muted"><input type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} className="accent-[var(--gold)]" />{tr("logo")}</label>
            <label className="flex items-center gap-2 text-sm text-text-muted"><input type="checkbox" checked={showUrl} onChange={(e) => setShowUrl(e.target.checked)} className="accent-[var(--gold)]" />{tr("showUrl")}</label>
            {showUrl && <label className="block text-xs text-text-muted">{tr("url")}<input className={`${input} mt-1`} dir="ltr" maxLength={60} value={url} onChange={(e) => setUrl(e.target.value)} /></label>}
          </div>
          <div>
            <div className={lbl}>{tr("colors")}</div>
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              <Color label={tr("bg1")} value={colors.bg1} onChange={(v) => setColors((c) => ({ ...c, bg1: v }))} />
              <Color label={tr("bg2")} value={colors.bg2} onChange={(v) => setColors((c) => ({ ...c, bg2: v }))} />
              <Color label={tr("textColor")} value={colors.text} onChange={(v) => setColors((c) => ({ ...c, text: v }))} />
              <Color label={tr("accent")} value={colors.accent} onChange={(v) => setColors((c) => ({ ...c, accent: v }))} />
              <Color label={tr("ctaText")} value={colors.ctaText} onChange={(v) => setColors((c) => ({ ...c, ctaText: v }))} />
            </div>
          </div>
          <div>
            <div className={lbl}>{tr("fonts")}</div>
            <div className="space-y-1.5">
              <Range label={tr("head")} value={scales.head} onChange={(v) => setScales((s) => ({ ...s, head: v }))} />
              <Range label={tr("sub")} value={scales.sub} onChange={(v) => setScales((s) => ({ ...s, sub: v }))} />
              <Range label={tr("btn")} value={scales.cta} onChange={(v) => setScales((s) => ({ ...s, cta: v }))} />
            </div>
          </div>
          <div>
            <div className={lbl}>{tr("align")}</div>
            <Seg label={tr("align")} value={align} onChange={setAlign} options={[{ value: "start", label: tr("start") }, { value: "center", label: tr("center") }, { value: "end", label: tr("end") }]} />
          </div>
        </div>
      </div>
      {exporting && (
        <div aria-hidden="true" style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}><EndScreenCanvas ref={exportRef} spec={spec} /></div>
      )}
    </div>
  );
}
