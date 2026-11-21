// YT-THUMB-v1: YouTube Thumbnail Creator inside the Social Media Studio.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { THUMB_H, THUMB_TEMPLATES, THUMB_W, clampNum, isAllowedImage, shadowCss, templateOf, thumbFileName, MAX_IMAGE_BYTES, type ThumbSpec } from "@/lib/ytThumb";
import YtThumbCanvas from "@/components/studio/YtThumbCanvas";

const read = (p: string) => readFileSync(p, "utf8");
const spec = (o: Partial<ThumbSpec> = {}): ThumbSpec => {
  const t = templateOf("bitcoin");
  return { lang: "en", headline: t.headline.en, subtitle: t.subtitle.en, tag: "BTC", ...t.style, align: "start", image: null, imgZoom: 100, imgX: 50, imgY: 50, showLogo: true, showUrl: true, url: "atlastrading.app", ...o };
};

describe("preset and templates", () => {
  it("is exactly 1280x720 and names files accordingly", () => {
    expect([THUMB_W, THUMB_H]).toEqual([1280, 720]);
    expect(thumbFileName("bitcoin", "ar", "jpeg")).toBe("atlas-thumbnail-bitcoin-1280x720-ar.jpg");
    expect(thumbFileName("atlas", "en", "png")).toBe("atlas-thumbnail-atlas-1280x720-en.png");
  });
  it("covers analysis, Bitcoin, Ethereum, market update and Atlas videos in EN/AR/FR", () => {
    expect(THUMB_TEMPLATES.map((t) => t.id)).toEqual(["analysis", "bitcoin", "ethereum", "market", "atlas"]);
    for (const t of THUMB_TEMPLATES) for (const l of ["en", "ar", "fr"] as const) { expect(t.headline[l].length).toBeGreaterThan(0); expect(t.subtitle[l].length).toBeGreaterThan(0); expect(t.name[l].length).toBeGreaterThan(0); }
  });
});

describe("helpers", () => {
  it("accepts only PNG/JPEG/WebP up to 8 MB", () => {
    expect(isAllowedImage({ type: "image/png", size: 1000 })).toBe(true);
    expect(isAllowedImage({ type: "image/webp", size: MAX_IMAGE_BYTES })).toBe(true);
    expect(isAllowedImage({ type: "image/svg+xml", size: 1000 })).toBe(false);
    expect(isAllowedImage({ type: "application/pdf", size: 1000 })).toBe(false);
    expect(isAllowedImage({ type: "image/png", size: MAX_IMAGE_BYTES + 1 })).toBe(false);
    expect(isAllowedImage({ type: "image/png", size: 0 })).toBe(false);
  });
  it("clamps numbers and builds the shadow", () => {
    expect(clampNum(999, 0, 12, 0)).toBe(12); expect(clampNum("x", 0, 12, 3)).toBe(3);
    expect(shadowCss(0)).toBe("none"); expect(shadowCss(50)).toMatch(/^0 \d+px \d+px rgba\(0,0,0,/);
  });
});

describe("YtThumbCanvas", () => {
  const html = (o?: Partial<ThumbSpec>) => renderToStaticMarkup(createElement(YtThumbCanvas, { spec: spec(o) }));
  it("renders at 1280x720 with headline, subtitle, tag, logo and URL", () => {
    const out = html();
    expect(out).toContain("width:1280px"); expect(out).toContain("height:720px");
    for (const s of ["Bitcoin Next Move", "Key levels to watch", "BTC", "/brand/icon-192.png", "atlastrading.app"]) expect(out).toContain(s);
  });
  it("hides branding, shows an uploaded image with overlay, outline and shadow", () => {
    expect(html({ showLogo: false, showUrl: false })).not.toContain("icon-192");
    const out = html({ image: "data:image/png;base64,AAAA", overlay: 40, outline: 6, imgZoom: 150 });
    expect(out).toContain("data:image/png;base64,AAAA"); expect(out).toContain("opacity:0.4"); expect(out).toContain("-webkit-text-stroke:6px"); expect(out).toContain("scale(1.5)");
    expect(html({ image: null })).not.toContain("<img src=\"data:");
  });
  it("is RTL for Arabic and ignores invalid colors", () => {
    expect(html({ lang: "ar", headline: "الخطوة القادمة" })).toContain('dir="rtl"');
    expect(html()).toContain('dir="ltr"');
    expect(html({ headColor: "red;x" })).not.toContain("red;x");
  });
});

describe("wiring", () => {
  it("is a Studio tab, exports PNG and JPEG via the Studio pipeline, reads images locally, no external services", () => {
    const page = read("app/share/page.tsx");
    expect(page).toContain("<YtThumbCreator"); expect(page).toContain("<EndScreenCreator"); expect(page).toContain("<StudioCanvas");
    const c = read("components/studio/YtThumbCreator.tsx");
    expect(c).toContain("renderStudioPng"); expect(c).toContain("pngToJpeg"); expect(c).toContain("FileReader"); expect(c).not.toMatch(/fetch\(|https?:\/\/(?!www\.w3)/);
    expect(read("components/studio/exportImage.ts")).toContain("image/jpeg");
  });
});
