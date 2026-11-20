"use client";
// YT-THUMB-v1: YouTube Thumbnail Creator inside the Social Media Studio: 1280x720 live preview, editable text, uploaded background
// image with zoom/position, gradient + overlay, text font/size/color/alignment/outline/shadow, templates, PNG/JPEG export at exact size.
// Uploaded images are read in the browser only (never uploaded anywhere). Uses the Studio's export pipeline (renderStudioPng).
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { describeExportError, renderStudioPng } from "@/lib/studioExport";
import YtThumbCanvas from "@/components/studio/YtThumbCanvas";
import { pngToJpeg, saveBlob } from "@/components/studio/exportImage";
import { FONTS, FONT_IDS, THUMB_H, THUMB_TEMPLATES, THUMB_W, clampNum, isAllowedImage, templateOf, thumbFileName, type Align, type FontId, type ImgFmt, type ThumbSpec, type ThumbTemplateId } from "@/lib/ytThumb";
import type { L3, Lang } from "@/lib/studio";

const L = (en: string, ar: string, fr: string): L3 => ({ en, ar, fr });
const UI = {
  intro: L("Create a 1280 × 720 YouTube thumbnail with a bold headline, your own background image and the Atlas branding.", "أنشئ صورة مصغرة ليوتيوب بحجم 1280 × 720 بعنوان قوي وصورة خلفية خاصة بك وهوية أطلس.", "Créez une miniature YouTube 1280 × 720 avec un titre percutant, votre image de fond et l'identité Atlas."),
  template: L("Template", "القالب", "Modèle"), language: L("Image language", "لغة الصورة", "Langue de l'image"), text: L("Text", "النص", "Texte"),
  tag: L("Tag (optional)", "وسم (اختياري)", "Étiquette (facultatif)"), headline: L("Headline", "العنوان", "Titre"), subtitle: L("Subtitle", "العنوان الفرعي", "Sous-titre"),
  style: L("Text style", "نمط النص", "Style du texte"), font: L("Font", "الخط", "Police"), headSize: L("Headline size", "حجم العنوان", "Taille du titre"), subSize: L("Subtitle size", "حجم الفرعي", "Taille sous-titre"),
  headColor: L("Headline", "العنوان", "Titre"), subColor: L("Subtitle", "الفرعي", "Sous-titre"), accent: L("Accent", "اللون المميز", "Accent"),
  align: L("Alignment", "المحاذاة", "Alignement"), start: L("Start", "البداية", "Début"), center: L("Center", "الوسط", "Centre"), end: L("End", "النهاية", "Fin"),
  outline: L("Outline", "الحدود", "Contour"), outlineColor: L("Outline color", "لون الحدود", "Couleur contour"), shadow: L("Shadow", "الظل", "Ombre"),
  bg: L("Background", "الخلفية", "Arrière-plan"), bg1: L("Color 1", "اللون 1", "Couleur 1"), bg2: L("Color 2", "اللون 2", "Couleur 2"), angle: L("Gradient angle", "زاوية التدرج", "Angle du dégradé"),
  image: L("Background image", "صورة الخلفية", "Image de fond"), upload: L("Upload image", "رفع صورة", "Téléverser une image"), replace: L("Replace image", "استبدال الصورة", "Remplacer l'image"), remove: L("Remove image", "إزالة الصورة", "Retirer l'image"),
  imgHint: L("PNG, JPEG or WebP, up to 8 MB. The file stays in your browser.", "PNG أو JPEG أو WebP حتى 8 ميغابايت. يبقى الملف في متصفحك.", "PNG, JPEG ou WebP, jusqu'à 8 Mo. Le fichier reste dans votre navigateur."),
  imgBad: L("Please choose a PNG, JPEG or WebP image under 8 MB.", "اختر صورة PNG أو JPEG أو WebP أقل من 8 ميغابايت.", "Choisissez une image PNG, JPEG ou WebP de moins de 8 Mo."),
  zoom: L("Zoom", "التكبير", "Zoom"), posX: L("Horizontal", "أفقي", "Horizontal"), posY: L("Vertical", "عمودي", "Vertical"),
  overlay: L("Overlay", "الطبقة", "Calque"), overlayColor: L("Overlay color", "لون الطبقة", "Couleur calque"),
  brand: L("Branding", "الهوية", "Identité"), logo: L("Show Atlas logo", "إظهار شعار أطلس", "Afficher le logo Atlas"), showUrl: L("Show website URL", "إظهار رابط الموقع", "Afficher l'URL"), chart: L("Chart motif", "رسم الشموع", "Motif graphique"),
  preview: L("Preview", "معاينة", "Aperçu"), png: L("Download PNG", "تنزيل PNG", "Télécharger PNG"), jpeg: L("Download JPEG", "تنزيل JPEG", "Télécharger JPEG"),
  working: L("Working…", "جارٍ…", "En cours…"), error: L("Could not create the image. Please try again.", "تعذر إنشاء الصورة. حاول مرة أخرى.", "Impossible de créer l'image. Réessayez."),
  note: L("Files are exported at exactly 1280 × 720 pixels.", "تُصدَّر الملفات بحجم 1280 × 720 بكسل بالضبط.", "Les fichiers sont exportés à exactement 1280 × 720 pixels."),
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
const Range = ({ label, value, min, max, onChange, unit = "" }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; unit?: string }) => (
  <label className="flex items-center gap-2 text-xs text-text-muted">
    <span className="w-28 shrink-0">{label}</span>
    <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(clampNum(e.target.value, min, max, value))} className="min-w-0 flex-1 accent-[var(--gold)]" />
    <span className="w-12 text-end font-data" dir="ltr">{value}{unit}</span>
  </label>
);

function initial(id: ThumbTemplateId, lang: Lang): ThumbSpec {
  const t = templateOf(id);
  return {
    lang, headline: t.headline[lang], subtitle: t.subtitle[lang], tag: t.tag[lang], ...t.style, align: "start",
    image: null, imgZoom: 100, imgX: 50, imgY: 50, showLogo: true, showUrl: true, url: "atlastrading.app",
  };
}

export default function YtThumbCreator() {
  const { lang: siteLang } = useLanguage();
  const tr = (k: keyof typeof UI) => UI[k][siteLang];
  const [tpl, setTpl] = useState<ThumbTemplateId>("analysis");
  const [spec, setSpec] = useState<ThumbSpec>(() => initial("analysis", "en"));
  const [imgError, setImgError] = useState(false);
  const [busy, setBusy] = useState<ImgFmt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const patch = (p: Partial<ThumbSpec>) => setSpec((s) => ({ ...s, ...p }));

  // A template restyles and refills the text but keeps the uploaded image and branding switches.
  const pickTemplate = (id: ThumbTemplateId) => {
    setTpl(id);
    setSpec((s) => ({ ...initial(id, s.lang), image: s.image, imgZoom: s.imgZoom, imgX: s.imgX, imgY: s.imgY, showLogo: s.showLogo, showUrl: s.showUrl, url: s.url }));
  };
  const pickLang = (lang: Lang) => {
    const t = templateOf(tpl);
    patch({ lang, headline: t.headline[lang], subtitle: t.subtitle[lang], tag: t.tag[lang] });
  };
  function onFile(f: File | undefined) {
    if (!f) return;
    if (!isAllowedImage(f)) { setImgError(true); return; }
    setImgError(false);
    const r = new FileReader();
    r.onload = () => patch({ image: String(r.result), imgZoom: 100, imgX: 50, imgY: 50, overlay: Math.max(spec.overlay, 35) });
    r.onerror = () => setImgError(true);
    r.readAsDataURL(f);
  }

  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / THUMB_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function exportAs(fmt: ImgFmt) {
    if (busy) return;
    setBusy(fmt); setError(null); setExporting(true);
    try {
      await sleep(600);
      const png = await renderStudioPng(exportRef.current, THUMB_W, THUMB_H);
      saveBlob(fmt === "jpeg" ? await pngToJpeg(png, THUMB_W, THUMB_H) : png, thumbFileName(tpl, spec.lang, fmt));
    } catch (err) {
      console.error("Thumbnail export failed", err);
      setError(describeExportError(err));
    } finally {
      setExporting(false); setBusy(null);
    }
  }

  const input = "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-text focus:border-gold/60 focus:outline-none";
  const lbl = "text-label text-text-muted mb-2";
  const btn = "rounded-md border border-line px-3 py-2 text-sm text-text-muted transition-colors hover:text-text disabled:opacity-50";

  return (
    <div data-yt-thumb-creator>
      <p className="max-w-2xl text-sm text-text-muted">{tr("intro")}</p>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="lg:order-2 lg:sticky lg:top-20">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-label text-text-muted">{tr("preview")}</div>
            <div className="font-data text-xs text-text-muted" dir="ltr">1280×720 · 16:9</div>
          </div>
          <div ref={box} dir="ltr" data-thumb-preview className="relative mx-auto w-full overflow-hidden rounded-xl border border-line" style={{ aspectRatio: `${THUMB_W} / ${THUMB_H}`, maxWidth: 640 }}>
            <div style={{ position: "absolute", top: 0, left: 0, width: THUMB_W, height: THUMB_H, transform: `scale(${scale})`, transformOrigin: "top left" }}><YtThumbCanvas spec={spec} /></div>
          </div>
          <div className="mx-auto mt-4 flex max-w-[640px] flex-wrap justify-center gap-2">
            <button type="button" onClick={() => exportAs("png")} disabled={!!busy} className="btn-primary text-sm disabled:opacity-50">{busy === "png" ? tr("working") : tr("png")}</button>
            <button type="button" onClick={() => exportAs("jpeg")} disabled={!!busy} className={btn}>{busy === "jpeg" ? tr("working") : tr("jpeg")}</button>
          </div>
          <p className="mt-2 text-center text-xs text-text-muted">{tr("note")}</p>
          {error && <div role="alert" className="mt-2 text-center text-sm text-bear"><p>{tr("error")}</p><p dir="ltr" className="mt-1 break-words font-data text-xs opacity-80">{error}</p></div>}
        </div>

        <div className="space-y-6 lg:order-1">
          <div>
            <div className={lbl}>{tr("template")}</div>
            <Seg label={tr("template")} value={tpl} onChange={pickTemplate} options={THUMB_TEMPLATES.map((x) => ({ value: x.id, label: x.name[siteLang] }))} />
          </div>
          <div>
            <div className={lbl}>{tr("language")}</div>
            <Seg label={tr("language")} value={spec.lang} onChange={pickLang} options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }, { value: "fr", label: "Français" }]} />
          </div>
          <div>
            <div className={lbl}>{tr("text")}</div>
            <label className="block text-xs text-text-muted">{tr("headline")}<textarea className={`${input} mt-1 min-h-[64px]`} dir="auto" maxLength={80} value={spec.headline} onChange={(e) => patch({ headline: e.target.value })} /></label>
            <label className="mt-3 block text-xs text-text-muted">{tr("subtitle")}<input className={`${input} mt-1`} dir="auto" maxLength={80} value={spec.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} /></label>
            <label className="mt-3 block text-xs text-text-muted">{tr("tag")}<input className={`${input} mt-1`} dir="auto" maxLength={20} value={spec.tag} onChange={(e) => patch({ tag: e.target.value })} /></label>
          </div>

          <div>
            <div className={lbl}>{tr("image")}</div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={tr("upload")} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className={btn}>{spec.image ? tr("replace") : tr("upload")}</button>
              {spec.image && <button type="button" onClick={() => patch({ image: null })} className={btn}>{tr("remove")}</button>}
            </div>
            <p className={`mt-2 text-xs ${imgError ? "text-bear" : "text-text-muted"}`} role={imgError ? "alert" : undefined}>{imgError ? tr("imgBad") : tr("imgHint")}</p>
            {spec.image && (
              <div className="mt-3 space-y-1.5">
                <Range label={tr("zoom")} value={spec.imgZoom} min={100} max={300} unit="%" onChange={(v) => patch({ imgZoom: v })} />
                <Range label={tr("posX")} value={spec.imgX} min={0} max={100} unit="%" onChange={(v) => patch({ imgX: v })} />
                <Range label={tr("posY")} value={spec.imgY} min={0} max={100} unit="%" onChange={(v) => patch({ imgY: v })} />
              </div>
            )}
          </div>

          <div>
            <div className={lbl}>{tr("bg")}</div>
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              <Color label={tr("bg1")} value={spec.bg1} onChange={(v) => patch({ bg1: v })} />
              <Color label={tr("bg2")} value={spec.bg2} onChange={(v) => patch({ bg2: v })} />
              <Color label={tr("overlayColor")} value={spec.overlayColor} onChange={(v) => patch({ overlayColor: v })} />
            </div>
            <div className="mt-3 space-y-1.5">
              <Range label={tr("angle")} value={spec.angle} min={0} max={360} unit="°" onChange={(v) => patch({ angle: v })} />
              <Range label={tr("overlay")} value={spec.overlay} min={0} max={90} unit="%" onChange={(v) => patch({ overlay: v })} />
            </div>
          </div>

          <div>
            <div className={lbl}>{tr("style")}</div>
            <div className="space-y-3">
              <div><div className="mb-1 text-xs text-text-muted">{tr("font")}</div><Seg<FontId> label={tr("font")} value={spec.font} onChange={(v) => patch({ font: v })} options={FONT_IDS.map((f) => ({ value: f, label: FONTS[f].name }))} /></div>
              <div><div className="mb-1 text-xs text-text-muted">{tr("align")}</div><Seg<Align> label={tr("align")} value={spec.align} onChange={(v) => patch({ align: v })} options={[{ value: "start", label: tr("start") }, { value: "center", label: tr("center") }, { value: "end", label: tr("end") }]} /></div>
              <div className="flex flex-wrap gap-x-5 gap-y-3">
                <Color label={tr("headColor")} value={spec.headColor} onChange={(v) => patch({ headColor: v })} />
                <Color label={tr("subColor")} value={spec.subColor} onChange={(v) => patch({ subColor: v })} />
                <Color label={tr("accent")} value={spec.accent} onChange={(v) => patch({ accent: v })} />
                <Color label={tr("outlineColor")} value={spec.outlineColor} onChange={(v) => patch({ outlineColor: v })} />
              </div>
              <div className="space-y-1.5">
                <Range label={tr("headSize")} value={spec.headSize} min={48} max={180} unit="px" onChange={(v) => patch({ headSize: v })} />
                <Range label={tr("subSize")} value={spec.subSize} min={20} max={80} unit="px" onChange={(v) => patch({ subSize: v })} />
                <Range label={tr("outline")} value={spec.outline} min={0} max={12} unit="px" onChange={(v) => patch({ outline: v })} />
                <Range label={tr("shadow")} value={spec.shadow} min={0} max={100} unit="%" onChange={(v) => patch({ shadow: v })} />
              </div>
            </div>
          </div>

          <div>
            <div className={lbl}>{tr("brand")}</div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-text-muted"><input type="checkbox" checked={spec.showLogo} onChange={(e) => patch({ showLogo: e.target.checked })} className="accent-[var(--gold)]" />{tr("logo")}</label>
              <label className="flex items-center gap-2 text-sm text-text-muted"><input type="checkbox" checked={spec.showUrl} onChange={(e) => patch({ showUrl: e.target.checked })} className="accent-[var(--gold)]" />{tr("showUrl")}</label>
              <label className="flex items-center gap-2 text-sm text-text-muted"><input type="checkbox" checked={spec.motif !== "none"} onChange={(e) => patch({ motif: e.target.checked ? (templateOf(tpl).style.motif === "none" ? "candles" : templateOf(tpl).style.motif) : "none" })} className="accent-[var(--gold)]" />{tr("chart")}</label>
            </div>
          </div>
        </div>
      </div>
      {exporting && <div aria-hidden="true" style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}><YtThumbCanvas ref={exportRef} spec={spec} /></div>}
    </div>
  );
}
