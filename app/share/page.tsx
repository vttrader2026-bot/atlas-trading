"use client";
// SOCIAL-STUDIO-v1: Atlas Social Media Studio. Replaces the old promo-card generator: compositions of virtual iPhones
// (the homepage and Investor phones plus feature screens) with editable text, 4 social formats, EN/FR/AR, light/dark, PNG export.
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { StudioExportError, describeExportError, renderStudioPng } from "@/lib/studioExport";
import StudioCanvas, { type Background, type CanvasSpec } from "@/components/studio/StudioCanvas";
import {
  DESC_MAX, FEATURES, FORMATS, FORMAT_IDS, HEADLINE_MAX, PRESETS, SCREEN_IDS, defaultPhones, featureOf, screenName, studioFileName,
  type FeatureId, type FormatId, type L3, type Lang, type PhoneAdj, type Preset,
} from "@/lib/studio";

const L = (en: string, ar: string, fr: string): L3 => ({ en, ar, fr });
const UI = {
  title: L("Social Media Studio", "استوديو وسائل التواصل", "Studio réseaux sociaux"),
  subtitle: L("Create marketing images with virtual Atlas phones for TikTok, Instagram, Facebook and more. Phones show real Atlas screens; the Investor and home phones use clearly labelled demo data.", "أنشئ صور تسويقية بهواتف أطلس الافتراضية لتيك توك وإنستغرام وفيسبوك وغيرها. تعرض الهواتف شاشات أطلس الحقيقية، وهاتفا الرئيسية والمستثمر يستخدمان بيانات تجريبية موضحة.", "Créez des visuels marketing avec les téléphones virtuels Atlas pour TikTok, Instagram, Facebook et plus. Les téléphones montrent de vrais écrans Atlas ; ceux d'accueil et Investisseur utilisent des données de démo clairement indiquées."),
  template: L("Template", "القالب", "Modèle"), format: L("Format", "الصيغة", "Format"), language: L("Image language", "لغة الصورة", "Langue de l'image"), theme: L("Theme", "المظهر", "Thème"),
  dark: L("Dark", "داكن", "Sombre"), light: L("Light", "فاتح", "Clair"), text: L("Text", "النص", "Texte"), headline: L("Headline", "العنوان", "Titre"), desc: L("Description", "الوصف", "Description"),
  resetText: L("Reset text", "إعادة النص", "Réinitialiser le texte"), bg: L("Background", "الخلفية", "Arrière-plan"),
  bgKinds: { brand: L("Atlas", "أطلس", "Atlas"), solid: L("Solid", "ثابت", "Uni"), gold: L("Gold", "ذهبي", "Or"), custom: L("Custom", "مخصص", "Perso") },
  phones: L("Phones", "الهواتف", "Téléphones"), count: L("Number of phones", "عدد الهواتف", "Nombre de téléphones"), layout: L("Layout", "التخطيط", "Disposition"),
  presets: { side: L("Side by side", "جنبًا إلى جنب", "Côte à côte"), stagger: L("Staggered", "متدرج", "Décalé"), fan: L("Fan", "مروحة", "Éventail") },
  phone: L("Phone", "الهاتف", "Téléphone"), screen: L("Screen", "الشاشة", "Écran"), size: L("Size", "الحجم", "Taille"), x: L("Horizontal", "أفقي", "Horizontal"), y: L("Vertical", "عمودي", "Vertical"), rot: L("Rotation", "الدوران", "Rotation"),
  resetPhones: L("Reset phones", "إعادة الهواتف", "Réinitialiser"), preview: L("Preview", "معاينة", "Aperçu"),
  download: L("Download PNG", "تنزيل PNG", "Télécharger PNG"), share: L("Share", "مشاركة", "Partager"), all: L("Download all formats", "تنزيل كل الصيغ", "Tout télécharger"),
  working: L("Working…", "جارٍ…", "En cours…"), error: L("Could not create the image. Please try again.", "تعذر إنشاء الصورة. حاول مرة أخرى.", "Impossible de créer l'image. Réessayez."),
  note: L("PNG files are exported at the exact pixel size shown.", "تُصدَّر ملفات PNG بالحجم الدقيق بالبكسل المعروض.", "Les PNG sont exportés à la taille exacte en pixels indiquée."),
};

function Seg<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={`rounded-md border px-2.5 py-1.5 text-xs sm:text-sm transition-colors ${o.value === value ? "border-gold/60 bg-gold/15 text-gold" : "border-line text-text-muted hover:text-text"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Range({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-text-muted">
      <span className="w-20 shrink-0">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-[var(--gold)]" />
      <span className="w-9 text-end font-data" dir="ltr">{value}</span>
    </label>
  );
}

/** Shows the full-size canvas scaled to the width of its container. */
function ScaledPreview({ format, children }: { format: FormatId; children: React.ReactNode }) {
  const { w, h } = FORMATS[format];
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / w));
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  const maxW = format === "story" ? 340 : format === "landscape" ? 640 : 460;
  return (
    <div ref={box} dir="ltr" data-studio-preview className="relative mx-auto w-full overflow-hidden rounded-xl border border-line" style={{ aspectRatio: `${w} / ${h}`, maxWidth: maxW }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function SharePage() {
  const { lang: siteLang } = useLanguage();
  const tr = (k: Exclude<keyof typeof UI, "bgKinds" | "presets">) => UI[k][siteLang];

  const [template, setTemplate] = useState<FeatureId>("overview");
  const [format, setFormat] = useState<FormatId>("story");
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [bg, setBg] = useState<Background>({ kind: "brand", color: "#0a0d12" });
  const [preset, setPreset] = useState<Preset>("side");
  const [phones, setPhones] = useState<PhoneAdj[]>(() => defaultPhones("overview", 2));
  const [edits, setEdits] = useState<Record<string, { h?: string; d?: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportFmt, setExportFmt] = useState<FormatId | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(typeof navigator !== "undefined" && typeof navigator.canShare === "function");
  }, []);

  const feat = featureOf(template);
  const key = `${template}:${lang}`;
  const headline = edits[key]?.h ?? feat.headline[lang];
  const desc = edits[key]?.d ?? feat.desc[lang];
  const setEdit = (patch: { h?: string; d?: string }) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));

  const specFor = (f: FormatId): CanvasSpec => ({ format: f, lang, theme, bg, headline, desc, phones, preset, template });

  function pickTemplate(id: FeatureId) {
    setTemplate(id);
    setPhones(defaultPhones(id, phones.length));
  }
  function setCount(n: number) {
    setPhones((cur) => {
      const defaults = defaultPhones(template, n);
      return defaults.map((d, i) => cur[i] ?? d);
    });
  }
  const patchPhone = (i: number, patch: Partial<PhoneAdj>) => setPhones((cur) => cur.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function makeBlob(f: FormatId): Promise<Blob> {
    setExportFmt(f);
    try {
      await sleep(900); // the hidden canvas mounts and its phones measure and scale themselves
      const { w, h } = FORMATS[f];
      return await renderStudioPng(exportRef.current, w, h);
    } finally {
      setExportFmt(null);
    }
  }

  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function run(f: FormatId, mode: "download" | "share") {
    if (busy) return;
    setBusy(`${mode}-${f}`);
    setError(null);
    try {
      const blob = await makeBlob(f);
      const name = studioFileName(template, f, lang, theme);
      if (mode === "share") {
        const file = new File([blob], name, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            return;
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
          }
        }
      }
      save(blob, name);
    } catch (err) {
      console.error("Studio export failed", FORMATS[f].ratio, err);
      setError(`${FORMATS[f].ratio}: ${describeExportError(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function runAll() {
    if (busy) return;
    setBusy("all");
    setError(null);
    const failed: string[] = [];
    for (const f of FORMAT_IDS) {
      try {
        save(await makeBlob(f), studioFileName(template, f, lang, theme));
      } catch (err) {
        console.error("Studio export failed", FORMATS[f].ratio, err);
        failed.push(`${FORMATS[f].ratio}: ${err instanceof StudioExportError ? err.message : describeExportError(err)}`);
      }
      await sleep(300);
    }
    if (failed.length) setError(`${failed.length}/${FORMAT_IDS.length} — ${failed.join(" | ")}`);
    setBusy(null);
  }

  const input = "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-text focus:border-gold/60 focus:outline-none";
  const lbl = "text-label text-text-muted mb-2";

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{tr("title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">{tr("subtitle")}</p>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* PREVIEW first on mobile, sticky on desktop */}
        <div className="lg:order-2 lg:sticky lg:top-20">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-label text-text-muted">{tr("preview")}</div>
            <div className="font-data text-xs text-text-muted" dir="ltr">{FORMATS[format].w}×{FORMATS[format].h} · {FORMATS[format].ratio}</div>
          </div>
          <ScaledPreview format={format}><StudioCanvas spec={specFor(format)} /></ScaledPreview>
          <div className="mx-auto mt-4 flex max-w-[460px] flex-wrap justify-center gap-2">
            {canShare && (
              <button type="button" onClick={() => run(format, "share")} disabled={!!busy} className="rounded-md border border-line px-3 py-2 text-sm text-text-muted transition-colors hover:text-text disabled:opacity-50">
                {busy === `share-${format}` ? tr("working") : tr("share")}
              </button>
            )}
            <button type="button" onClick={() => run(format, "download")} disabled={!!busy} className="btn-primary text-sm disabled:opacity-50">
              {busy === `download-${format}` ? tr("working") : tr("download")}
            </button>
            <button type="button" onClick={runAll} disabled={!!busy} className="rounded-md border border-line px-3 py-2 text-sm text-text-muted transition-colors hover:text-text disabled:opacity-50">
              {busy === "all" ? tr("working") : tr("all")}
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-text-muted">{tr("note")}</p>
          {error && (
            <div role="alert" className="mt-2 text-center text-sm text-bear">
              <p>{tr("error")}</p>
              <p dir="ltr" className="mt-1 break-words font-data text-xs opacity-80">{error}</p>
            </div>
          )}
        </div>

        {/* CONTROLS */}
        <div className="space-y-6 lg:order-1">
          <div>
            <div className={lbl}>{tr("template")}</div>
            <Seg label={tr("template")} value={template} onChange={pickTemplate} options={FEATURES.map((f) => ({ value: f.id, label: f.name[siteLang] }))} />
          </div>
          <div>
            <div className={lbl}>{tr("format")}</div>
            <Seg label={tr("format")} value={format} onChange={setFormat} options={FORMAT_IDS.map((f) => ({ value: f, label: `${FORMATS[f].ratio} · ${FORMATS[f].use[siteLang]}` }))} />
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className={lbl}>{tr("language")}</div>
              <Seg label={tr("language")} value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }, { value: "fr", label: "Français" }]} />
            </div>
            <div>
              <div className={lbl}>{tr("theme")}</div>
              <Seg label={tr("theme")} value={theme} onChange={setTheme} options={[{ value: "dark", label: tr("dark") }, { value: "light", label: tr("light") }]} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-label text-text-muted">{tr("text")}</div>
              <button type="button" onClick={() => setEdits((e) => { const n = { ...e }; delete n[key]; return n; })} className="text-xs text-text-muted underline-offset-2 hover:text-text hover:underline">{tr("resetText")}</button>
            </div>
            <label className="block text-xs text-text-muted">{tr("headline")}
              <input className={`${input} mt-1`} dir="auto" maxLength={HEADLINE_MAX} value={headline} onChange={(e) => setEdit({ h: e.target.value })} />
            </label>
            <label className="mt-3 block text-xs text-text-muted">{tr("desc")}
              <textarea className={`${input} mt-1 min-h-[84px]`} dir="auto" maxLength={DESC_MAX} value={desc} onChange={(e) => setEdit({ d: e.target.value })} />
            </label>
          </div>

          <div>
            <div className={lbl}>{tr("bg")}</div>
            <div className="flex flex-wrap items-center gap-3">
              <Seg label={tr("bg")} value={bg.kind} onChange={(kind) => setBg((b) => ({ ...b, kind }))} options={(["brand", "solid", "gold", "custom"] as const).map((k) => ({ value: k, label: UI.bgKinds[k][siteLang] }))} />
              {bg.kind === "custom" && <input type="color" aria-label={tr("bg")} value={bg.color} onChange={(e) => setBg((b) => ({ ...b, color: e.target.value }))} className="h-9 w-12 cursor-pointer rounded border border-line bg-transparent" />}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-label text-text-muted">{tr("phones")}</div>
              <button type="button" onClick={() => setPhones(defaultPhones(template, phones.length))} className="text-xs text-text-muted underline-offset-2 hover:text-text hover:underline">{tr("resetPhones")}</button>
            </div>
            <div className="flex flex-wrap gap-6">
              <div>
                <div className="mb-1 text-xs text-text-muted">{tr("count")}</div>
                <Seg label={tr("count")} value={phones.length} onChange={setCount} options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
              </div>
              <div>
                <div className="mb-1 text-xs text-text-muted">{tr("layout")}</div>
                <Seg label={tr("layout")} value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ value: p, label: UI.presets[p][siteLang] }))} />
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {phones.map((p, i) => (
                <fieldset key={i} className="rounded-lg border border-line p-3">
                  <legend className="px-1 text-xs font-semibold text-gold">{tr("phone")} {i + 1}</legend>
                  <label className="block text-xs text-text-muted">{tr("screen")}
                    <select aria-label={`${tr("phone")} ${i + 1} ${tr("screen")}`} className={`${input} mt-1`} value={p.screen} onChange={(e) => patchPhone(i, { screen: e.target.value as PhoneAdj["screen"] })}>
                      {SCREEN_IDS.map((s) => <option key={s} value={s}>{screenName(s, siteLang)}</option>)}
                    </select>
                  </label>
                  <div className="mt-3 space-y-1.5">
                    <Range label={tr("size")} value={p.size} min={50} max={150} onChange={(v) => patchPhone(i, { size: v })} />
                    <Range label={tr("x")} value={p.dx} min={-40} max={40} onChange={(v) => patchPhone(i, { dx: v })} />
                    <Range label={tr("y")} value={p.dy} min={-40} max={40} onChange={(v) => patchPhone(i, { dy: v })} />
                    <Range label={tr("rot")} value={p.rot} min={-25} max={25} onChange={(v) => patchPhone(i, { rot: v })} />
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Off-screen, exact-size composition: this is what gets converted to PNG (mounted only while exporting). */}
      {exportFmt && (
        <div aria-hidden="true" style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}>
          <StudioCanvas ref={exportRef} spec={specFor(exportFmt)} />
        </div>
      )}
    </main>
  );
}
