// PROJECTS-v1: turns saved project data back into editor state. Saved data is untrusted input (any JSON), so every field is checked and
// falls back to the default; a project from an older version still opens. Pure, no React.
import { FEATURES, FORMAT_IDS, PRESETS, defaultPhones, isHexColor, type FeatureId, type FormatId, type Lang, type PhoneAdj, type Preset, type ScreenId } from "@/lib/studio";
import { MAX_DIM, SIZE_IDS, clampDim, clampScale, templateOf as endTemplate, END_TEMPLATES, type Align as EndAlign, type EndTemplateId, type SizeId } from "@/lib/endScreen";
import { FONT_IDS, THUMB_TEMPLATES, clampNum, templateOf as thumbTemplate, type FontId, type Motif, type ThumbSpec, type ThumbTemplateId, type Align as ThumbAlign } from "@/lib/ytThumb";

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const oneOf = <T extends string>(v: unknown, list: readonly T[], fb: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fb);
const str = (v: unknown, max: number, fb: string): string => (typeof v === "string" ? v.slice(0, max) : fb);
const bool = (v: unknown, fb: boolean): boolean => (typeof v === "boolean" ? v : fb);
const hex = (v: unknown, fb: string): string => (isHexColor(v) ? v : fb);
const LANGS: Lang[] = ["en", "ar", "fr"];
const ALIGNS: EndAlign[] = ["start", "center", "end"];
export const IMAGE_DATA_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 850_000;

// ---- Phone Studio ----
export type PhoneState = { template: FeatureId; format: FormatId; lang: Lang; theme: "dark" | "light"; bg: { kind: "brand" | "solid" | "gold" | "custom"; color: string }; preset: Preset; phones: PhoneAdj[]; edits: Record<string, { h?: string; d?: string }> };
export const phoneStateOf = (s: PhoneState): Record<string, unknown> => ({ ...s });
export function restorePhone(raw: unknown): PhoneState {
  const d = rec(raw);
  const template = oneOf(d.template, FEATURES.map((f) => f.id), "overview");
  const screens = new Set<string>(["home", "investor", ...FEATURES.map((f) => `f:${f.id}`)]);
  const phones: PhoneAdj[] = (Array.isArray(d.phones) ? d.phones : []).slice(0, 3).flatMap((p) => {
    const r = rec(p);
    return typeof r.screen === "string" && screens.has(r.screen)
      ? [{ screen: r.screen as ScreenId, size: clampNum(r.size, 40, 200, 100), dx: clampNum(r.dx, -1000, 1000, 0), dy: clampNum(r.dy, -1000, 1000, 0), rot: clampNum(r.rot, -45, 45, 0) }]
      : [];
  });
  const edits: PhoneState["edits"] = {};
  for (const [k, v] of Object.entries(rec(d.edits)).slice(0, 100)) {
    const e = rec(v);
    edits[k.slice(0, 40)] = { ...(typeof e.h === "string" ? { h: e.h.slice(0, 300) } : {}), ...(typeof e.d === "string" ? { d: e.d.slice(0, 600) } : {}) };
  }
  const bg = rec(d.bg);
  return {
    template, format: oneOf(d.format, FORMAT_IDS, "story"), lang: oneOf(d.lang, LANGS, "en"), theme: oneOf(d.theme, ["dark", "light"] as const, "dark"),
    bg: { kind: oneOf(bg.kind, ["brand", "solid", "gold", "custom"] as const, "brand"), color: hex(bg.color, "#0a0d12") },
    preset: oneOf(d.preset, PRESETS, "side"), phones: phones.length ? phones : defaultPhones(template, 2), edits,
  };
}

// ---- End Screen ----
export type EndState = {
  tpl: EndTemplateId; lang: Lang; size: SizeId; custom: { w: string; h: string }; edits: Record<string, { h?: string; s?: string; c?: string }>;
  colors: { bg1: string; bg2: string; text: string; accent: string; ctaText: string }; align: EndAlign; scales: { head: number; sub: number; cta: number }; showLogo: boolean; showUrl: boolean; url: string;
};
export const defaultEndState = (): EndState => ({
  tpl: "watch", lang: "en", size: "story", custom: { w: "1080", h: "1080" }, edits: {}, colors: { ...endTemplate("watch").colors }, align: "center",
  scales: { head: 100, sub: 100, cta: 100 }, showLogo: true, showUrl: true, url: "atlastrading.app",
});
export function restoreEnd(raw: unknown): EndState {
  const d = rec(raw), def = defaultEndState();
  const tpl = oneOf(d.tpl, END_TEMPLATES.map((t) => t.id), def.tpl);
  const c = rec(d.colors), base = endTemplate(tpl).colors, cu = rec(d.custom), sc = rec(d.scales);
  const edits: EndState["edits"] = {};
  for (const [k, v] of Object.entries(rec(d.edits)).slice(0, 20)) {
    const e = rec(v);
    edits[k.slice(0, 20)] = { ...(typeof e.h === "string" ? { h: e.h.slice(0, 80) } : {}), ...(typeof e.s === "string" ? { s: e.s.slice(0, 160) } : {}), ...(typeof e.c === "string" ? { c: e.c.slice(0, 40) } : {}) };
  }
  return {
    tpl, lang: oneOf(d.lang, LANGS, "en"), size: oneOf(d.size, SIZE_IDS, "story"), custom: { w: String(clampDim(cu.w)), h: String(clampDim(cu.h)) }, edits,
    colors: { bg1: hex(c.bg1, base.bg1), bg2: hex(c.bg2, base.bg2), text: hex(c.text, base.text), accent: hex(c.accent, base.accent), ctaText: hex(c.ctaText, base.ctaText) },
    align: oneOf(d.align, ALIGNS, "center"), scales: { head: clampScale(sc.head), sub: clampScale(sc.sub), cta: clampScale(sc.cta) },
    showLogo: bool(d.showLogo, true), showUrl: bool(d.showUrl, true), url: str(d.url, 60, def.url),
  };
}
export { MAX_DIM };

// ---- YouTube Thumbnail ----
export function initialThumbSpec(id: ThumbTemplateId, lang: Lang): ThumbSpec {
  const t = thumbTemplate(id);
  return { lang, headline: t.headline[lang], subtitle: t.subtitle[lang], tag: t.tag[lang], ...t.style, align: "start", image: null, imgZoom: 100, imgX: 50, imgY: 50, showLogo: true, showUrl: true, url: "atlastrading.app" };
}
export function restoreThumb(raw: unknown): { tpl: ThumbTemplateId; spec: ThumbSpec } {
  const d = rec(raw), s = rec(d.spec);
  const tpl = oneOf(d.tpl, THUMB_TEMPLATES.map((t) => t.id), "analysis");
  const lang = oneOf(s.lang, LANGS, "en");
  const b = initialThumbSpec(tpl, lang);
  const image = typeof s.image === "string" && s.image.length <= MAX_IMAGE_CHARS && IMAGE_DATA_RE.test(s.image) ? s.image : null;
  const spec: ThumbSpec = {
    lang, headline: str(s.headline, 80, b.headline), subtitle: str(s.subtitle, 80, b.subtitle), tag: str(s.tag, 20, b.tag),
    bg1: hex(s.bg1, b.bg1), bg2: hex(s.bg2, b.bg2), angle: clampNum(s.angle, 0, 360, b.angle),
    image, imgZoom: clampNum(s.imgZoom, 100, 300, 100), imgX: clampNum(s.imgX, 0, 100, 50), imgY: clampNum(s.imgY, 0, 100, 50),
    overlayColor: hex(s.overlayColor, b.overlayColor), overlay: clampNum(s.overlay, 0, 90, b.overlay),
    font: oneOf<FontId>(s.font, FONT_IDS, b.font), headSize: clampNum(s.headSize, 48, 180, b.headSize), subSize: clampNum(s.subSize, 20, 80, b.subSize),
    headColor: hex(s.headColor, b.headColor), subColor: hex(s.subColor, b.subColor), accent: hex(s.accent, b.accent), align: oneOf<ThumbAlign>(s.align, ALIGNS, "start"),
    outline: clampNum(s.outline, 0, 12, b.outline), outlineColor: hex(s.outlineColor, b.outlineColor), shadow: clampNum(s.shadow, 0, 100, b.shadow),
    motif: oneOf<Motif>(s.motif, ["candles", "diamond", "none"], b.motif), showLogo: bool(s.showLogo, true), showUrl: bool(s.showUrl, true), url: str(s.url, 60, b.url),
  };
  return { tpl, spec };
}
