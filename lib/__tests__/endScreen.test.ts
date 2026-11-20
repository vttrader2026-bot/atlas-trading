// END-SCREEN-v1: End Screen Creator inside the Social Media Studio.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { END_SIZES, END_TEMPLATES, MAX_DIM, MIN_DIM, clampDim, clampScale, endFileName, sizeOf, templateOf, type EndSpec } from "@/lib/endScreen";
import EndScreenCanvas from "@/components/studio/EndScreenCanvas";
import { isOwnerPath } from "@/lib/privateRoutes";

const read = (p: string) => readFileSync(p, "utf8");
const spec = (o: Partial<EndSpec> = {}): EndSpec => ({
  w: 1080, h: 1920, lang: "en", headline: "Watch the Full Video", subtitle: "Sub", cta: "Watch now", url: "atlastrading.app", showLogo: true, showUrl: true,
  ...templateOf("watch").colors, align: "center", headScale: 100, subScale: 100, ctaScale: 100, ...o,
});

describe("sizes", () => {
  it("has the four ratios at exact resolutions and a clamped custom size", () => {
    expect(END_SIZES.story).toMatchObject({ w: 1080, h: 1920, ratio: "9:16" });
    expect(END_SIZES.wide).toMatchObject({ w: 1920, h: 1080, ratio: "16:9" });
    expect(END_SIZES.square).toMatchObject({ w: 1080, h: 1080, ratio: "1:1" });
    expect(END_SIZES.portrait).toMatchObject({ w: 1080, h: 1350, ratio: "4:5" });
    expect(sizeOf("story", { w: 5, h: 5 })).toEqual({ w: 1080, h: 1920 });
    expect(sizeOf("custom", { w: 1234, h: 777 })).toEqual({ w: 1234, h: 777 });
    expect(sizeOf("custom", { w: 10, h: 99999 })).toEqual({ w: MIN_DIM, h: MAX_DIM });
    expect(clampDim("abc")).toBe(1080); expect(clampDim(NaN, 500)).toBe(500); expect(clampDim(640.6)).toBe(641);
    expect(clampScale(10)).toBe(50); expect(clampScale(999)).toBe(200); expect(clampScale("x")).toBe(100);
  });
});

describe("templates and file names", () => {
  it("includes Watch the Full Video and Visit Atlas Trading in EN/AR/FR", () => {
    expect(templateOf("watch").headline.en).toBe("Watch the Full Video");
    expect(templateOf("visit").headline.en).toBe("Visit Atlas Trading");
    for (const t of END_TEMPLATES) for (const l of ["en", "ar", "fr"] as const) { expect(t.headline[l].length).toBeGreaterThan(0); expect(t.subtitle[l].length).toBeGreaterThan(0); expect(t.cta[l].length).toBeGreaterThan(0); }
  });
  it("names files with exact size and extension", () => {
    expect(endFileName("watch", 1080, 1920, "en", "png")).toBe("atlas-endscreen-watch-1080x1920-en.png");
    expect(endFileName("visit", 1200, 630, "ar", "jpeg")).toBe("atlas-endscreen-visit-1200x630-ar.jpg");
  });
});

describe("EndScreenCanvas", () => {
  const html = (o?: Partial<EndSpec>) => renderToStaticMarkup(createElement(EndScreenCanvas, { spec: spec(o) }));
  it("renders at the exact size with headline, subtitle, CTA, logo and URL", () => {
    const out = html();
    expect(out).toContain("width:1080px"); expect(out).toContain("height:1920px");
    for (const s of ["Watch the Full Video", "Sub", "Watch now", "atlastrading.app", "/brand/icon-192.png", "TRADING"]) expect(out).toContain(s);
  });
  it("can hide logo and URL, and is RTL for Arabic", () => {
    const out = html({ showLogo: false, showUrl: false });
    expect(out).not.toContain("icon-192"); expect(out).not.toContain("atlastrading.app");
    const ar = html({ lang: "ar", headline: "شاهد الفيديو كاملاً" });
    expect(ar).toContain('dir="rtl"'); expect(ar).toContain("شاهد الفيديو كاملاً"); expect(html()).toContain('dir="ltr"');
  });
  it("applies colors, alignment and font scale; ignores invalid colors", () => {
    expect(html({ bg1: "#112233", bg2: "#445566" })).toContain("#112233");
    expect(html({ bg1: "javascript:x" })).not.toContain("javascript");
    expect(html({ align: "end" })).toContain("flex-end");
    expect(html({ headScale: 200 })).toContain("font-size:192px");
  });
});

describe("wiring", () => {
  it("is a tab in the owner-only Studio, exports PNG and JPEG through the Studio pipeline, with no external services", () => {
    expect(isOwnerPath("/share")).toBe(true);
    const page = read("app/share/page.tsx");
    expect(page).toContain("<EndScreenCreator />"); expect(page).toContain("<StudioCanvas");
    const c = read("components/studio/EndScreenCreator.tsx");
    expect(c).toContain("renderStudioPng"); expect(c).toContain("image/jpeg"); expect(c).not.toMatch(/fetch\(|https?:\/\/(?!www\.w3)/);
  });
});
