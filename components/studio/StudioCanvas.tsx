"use client";
// SOCIAL-STUDIO-v1: the marketing composition at its EXACT export size (e.g. 1080x1920). The editor shows it scaled down;
// the PNG export mounts a second copy at 1:1 and captures that, so the file is the final composition, not a preview.
import { forwardRef } from "react";
import HeroPhone from "@/components/home/HeroPhone";
import InvestorPhone from "@/components/home/InvestorPhone";
import FeaturePhone from "@/components/studio/FeaturePhone";
import { LanguageOverride } from "@/lib/i18n";
import { FORMATS, layoutPhones, placePhone, phoneH, isHexColor, luminance, type FeatureId, type FormatId, type Lang, type PhoneAdj, type Preset, type ScreenId } from "@/lib/studio";

export type Background = { kind: "brand" | "solid" | "gold" | "custom"; color: string };
export type CanvasSpec = { format: FormatId; lang: Lang; theme: "dark" | "light"; bg: Background; headline: string; desc: string; phones: PhoneAdj[]; preset: Preset; template: FeatureId };

// Theme variables are scoped to the canvas so it can differ from the site theme; the overrides stop the phones' entrance
// animations (a frozen mid-animation frame would otherwise be exported) and lift their web max-widths.
const CSS = `
.studio-canvas.studio-dark{--bg:#0a0d12;--surface:#10151c;--surface-raised:#171f29;--line:#212a36;--text:#f2f4f7;--text-muted:#a0aab9;--bull:#35c48a;--bear:#ef5350;--gold:#e3a23d}
.studio-canvas.studio-light{--bg:#f5f7fb;--surface:#ffffff;--surface-raised:#eef2f7;--line:#d7dde6;--text:#111827;--text-muted:#5b6472;--bull:#158a5a;--bear:#d64545;--gold:#b8842f}
.studio-canvas .home-rise,.studio-canvas .home-fade,.studio-canvas .home-draw,.studio-canvas .home-grow,.studio-canvas .radar-row-in{animation:none!important;opacity:1!important;stroke-dashoffset:0!important;transform:none!important}
.studio-canvas figcaption{display:none!important}
.studio-canvas .home-phone-float,.studio-canvas .hero-phone-w{animation:none!important;max-width:none!important;width:100%!important}
`;

export function effectiveTheme(spec: Pick<CanvasSpec, "theme" | "bg">): "dark" | "light" {
  if (spec.bg.kind === "gold") return "light";
  if (spec.bg.kind === "custom" && isHexColor(spec.bg.color)) return luminance(spec.bg.color) < 0.4 ? "dark" : "light";
  return spec.theme;
}

function background(spec: CanvasSpec): string {
  switch (spec.bg.kind) {
    case "solid": return "var(--bg)";
    case "gold": return "linear-gradient(160deg,#f7c25c,#c98f2e)";
    case "custom": return isHexColor(spec.bg.color) ? spec.bg.color : "var(--bg)";
    default: return "radial-gradient(70% 45% at 50% 40%, color-mix(in srgb, var(--gold) 24%, transparent), transparent 72%), linear-gradient(165deg, var(--bg), var(--surface-raised))";
  }
}

function Screen({ id, lang }: { id: ScreenId; lang: Lang }) {
  if (id === "home") return <HeroPhone />;
  if (id === "investor") return <InvestorPhone />;
  return <FeaturePhone feature={id.slice(2) as FeatureId} lang={lang} />;
}

const StudioCanvas = forwardRef<HTMLDivElement, { spec: CanvasSpec }>(function StudioCanvas({ spec }, ref) {
  const F = FORMATS[spec.format];
  const rtl = spec.lang === "ar";
  const theme = effectiveTheme(spec);
  const slots = layoutPhones(spec.format, spec.phones.length, spec.preset, rtl);
  const wide = spec.format === "landscape";
  const T = F.text;
  const tx = wide && rtl ? F.w - T.x - T.w : T.x; // in RTL landscape the phones sit on the left and the text on the right
  return (
    <LanguageOverride lang={spec.lang}>
      <style>{CSS}</style>
      <div
        ref={ref}
        dir={rtl ? "rtl" : "ltr"}
        lang={spec.lang}
        data-studio-canvas={spec.format}
        className={`studio-canvas studio-${theme} relative overflow-hidden text-text`}
        style={{ width: F.w, height: F.h, background: background(spec), fontFamily: rtl ? "var(--font-arabic), system-ui, sans-serif" : undefined }}
      >
        <div data-studio-text className="absolute flex flex-col overflow-hidden" style={{ left: tx, top: T.y, width: T.w, height: T.h, alignItems: wide ? "flex-start" : "center", textAlign: wide ? "start" : "center" }}>
          <div className="flex shrink-0 items-center gap-3" dir="ltr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/icon-192.png" alt="" width={wide ? 40 : 44} height={wide ? 40 : 44} className="rounded-xl" />
            <span className="font-heading font-bold tracking-tight" style={{ fontSize: wide ? 26 : 30 }}>Atlas <span className="text-gold">TRADING</span></span>
          </div>
          <h1 className="shrink-0 font-heading font-bold tracking-tight" style={{ fontSize: F.headPx, lineHeight: 1.1, marginTop: wide ? 28 : 24, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{spec.headline}</h1>
          <p className="shrink-0 text-text-muted" style={{ fontSize: F.descPx, lineHeight: 1.35, marginTop: wide ? 20 : 16, display: "-webkit-box", WebkitLineClamp: wide ? 5 : 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{spec.desc}</p>
        </div>
        {slots.map((slot, i) => {
          const p = placePhone(spec.format, slot, spec.phones[i]);
          return (
            <div key={i} data-studio-phone={i} className="absolute" style={{ left: p.cx - p.w / 2, top: p.cy - phoneH(p.w) / 2, width: p.w, transform: `rotate(${p.rot}deg)`, zIndex: slot.z }}>
              <Screen id={spec.phones[i].screen} lang={spec.lang} />
            </div>
          );
        })}
        <div className="absolute text-text-muted font-data" dir="ltr" style={{ left: wide ? tx : 0, bottom: wide ? 30 : 26, width: wide ? T.w : F.w, textAlign: wide ? "start" : "center", fontSize: wide ? 22 : 28 }}>atlastrading.app</div>
      </div>
    </LanguageOverride>
  );
});
export default StudioCanvas;
