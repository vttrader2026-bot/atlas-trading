// SOCIAL-STUDIO-v1
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DESC_MAX, FEATURES, FORMATS, FORMAT_IDS, HEADLINE_MAX, PRESETS, SCREEN_IDS, defaultPhones, isHexColor, layoutPhones, luminance, phoneBounds, phoneH, placePhone, screenName, studioFileName, featureOf } from "@/lib/studio";

const read = (f: string) => readFileSync(f, "utf8");
const LANGS = ["en", "ar", "fr"] as const;

describe("formats", () => {
  it("exact export sizes and ratios", () => {
    expect(FORMAT_IDS.map((f) => [FORMATS[f].ratio, FORMATS[f].w, FORMATS[f].h])).toEqual([["9:16", 1080, 1920], ["1:1", 1080, 1080], ["4:5", 1080, 1350], ["1.91:1", 1200, 628]]);
    expect(1200 / 628).toBeCloseTo(1.91, 2);
  });
});

describe("templates", () => {
  it("covers every Atlas feature with EN/FR/AR copy inside the editor limits", () => {
    expect(FEATURES.map((f) => f.id)).toEqual(["overview", "analyzer", "radar", "pulse", "feed", "journal", "binance", "dca", "investor", "academy", "updates"]);
    for (const f of FEATURES) for (const l of LANGS) {
      expect(f.name[l].length).toBeGreaterThan(2);
      expect(f.headline[l].length).toBeGreaterThan(5); expect(f.headline[l].length).toBeLessThanOrEqual(HEADLINE_MAX);
      expect(f.desc[l].length).toBeGreaterThan(10); expect(f.desc[l].length).toBeLessThanOrEqual(DESC_MAX);
      for (const b of f.bullets) expect(b[l].length).toBeGreaterThan(2);
    }
  });
  it("makes no invented statistics, prices or profit claims", () => {
    for (const f of FEATURES) for (const l of LANGS) {
      const all = [f.headline[l], f.desc[l], ...f.bullets.map((b) => b[l])].join(" ");
      expect(all).not.toMatch(/\d+\s?%|\$\s?\d|\d+\s?(USDT|MRU)|guarantee|garanti|ضمان|profit of|x\d/i);
    }
    expect(featureOf("binance").desc.en).toMatch(/never places orders/i);
    expect(featureOf("analyzer").desc.en).toMatch(/not financial advice/i);
  });
  it("each template defaults to two different screens", () => {
    for (const f of FEATURES) { expect(f.phones.length).toBeGreaterThanOrEqual(2); expect(new Set(f.phones).size).toBe(f.phones.length); }
  });
  it("every screen has a name in every language; home and investor reuse the existing phones", () => {
    for (const s of SCREEN_IDS) for (const l of LANGS) expect(screenName(s, l).length).toBeGreaterThan(2);
    expect(SCREEN_IDS).toContain("home"); expect(SCREEN_IDS).toContain("investor"); expect(SCREEN_IDS.length).toBe(13);
  });
});

describe("layout engine: every format x count x preset x direction stays inside the canvas", () => {
  for (const fmt of FORMAT_IDS) for (const n of [1, 2, 3]) for (const preset of PRESETS) for (const rtl of [false, true]) {
    it(`${fmt} n=${n} ${preset} rtl=${rtl}`, () => {
      const F = FORMATS[fmt];
      const slots = layoutPhones(fmt, n, preset, rtl);
      expect(slots).toHaveLength(n);
      for (const s of slots) {
        const b = phoneBounds(s);
        expect(b.left).toBeGreaterThanOrEqual(0); expect(b.top).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(F.w); expect(b.bottom).toBeLessThanOrEqual(F.h);
        expect(s.w).toBeGreaterThan(100);
      }
      if (preset !== "fan") { // no overlap between neighbours in the plain layouts
        const bs = slots.map(phoneBounds).sort((a, b) => a.left - b.left);
        for (let i = 1; i < bs.length; i++) expect(bs[i].left).toBeGreaterThanOrEqual(bs[i - 1].right - 0.5);
      }
    });
  }
  it("phones never overlap the text box in portrait formats and landscape", () => {
    for (const fmt of FORMAT_IDS) for (const n of [1, 2, 3]) for (const preset of PRESETS) for (const rtl of [false, true]) {
      const T = FORMATS[fmt].text;
      for (const s of layoutPhones(fmt, n, preset, rtl)) {
        const b = phoneBounds(s);
        if (fmt === "landscape") { const tl = rtl ? FORMATS[fmt].w - T.x - T.w : T.x, tr = tl + T.w; expect(b.left >= tr || b.right <= tl).toBe(true); }
        else expect(b.top).toBeGreaterThanOrEqual(T.y + T.h - 1);
      }
    }
  });
  it("RTL mirrors the layout and phone height matches the 390x844 screen plus bezel", () => {
    const a = layoutPhones("landscape", 2, "side", false), b = layoutPhones("landscape", 2, "side", true);
    expect(b[0].cx).toBeCloseTo(1200 - a[0].cx, 5);
    expect(phoneH(300)).toBeCloseTo(((300 - 14) * 844) / 390 + 14, 6);
  });
  it("size, position and rotation adjustments are applied and clamped", () => {
    const s = layoutPhones("square", 1, "side")[0];
    const p = placePhone("square", s, { size: 80, dx: 10, dy: -10, rot: 5 });
    expect(p.w).toBeCloseTo(s.w * 0.8, 6); expect(p.cx).toBeCloseTo(s.cx + 108, 6); expect(p.cy).toBeCloseTo(s.cy - 108, 6); expect(p.rot).toBe(5);
    expect(placePhone("square", s, { size: 999, dx: 999, dy: 0, rot: 999 }).w).toBeCloseTo(s.w * 1.5, 6);
    expect(placePhone("square", s, { size: 100, dx: 0, dy: 0, rot: 999 }).rot).toBe(25);
  });
  it("defaultPhones gives distinct screens for 1, 2 and 3 phones", () => {
    for (const f of FEATURES) for (const n of [1, 2, 3]) { const d = defaultPhones(f.id, n); expect(d).toHaveLength(n); expect(new Set(d.map((x) => x.screen)).size).toBe(n); }
  });
});

describe("helpers", () => {
  it("colour and filename helpers", () => {
    expect(isHexColor("#a1B2c3")).toBe(true); expect(isHexColor("red")).toBe(false); expect(isHexColor("#fff")).toBe(false);
    expect(luminance("#000000")).toBe(0); expect(luminance("#ffffff")).toBeCloseTo(1, 5);
    expect(studioFileName("radar", "landscape", "ar", "light")).toBe("atlas-radar-1.91x1-ar-light.png");
  });
});

describe("old card system is gone and the Studio is wired", () => {
  it("removes promo cards, their content and the old preview", () => {
    for (const f of ["components/share/PromoCard.tsx", "lib/shareCards.ts", "components/share/SharePhones.tsx"]) expect(existsSync(f)).toBe(false);
    const page = read("app/share/page.tsx");
    for (const w of ["PromoCard", "shareCards", "CARD_SECTIONS", "ScaledPreview({ size"]) expect(page).not.toContain(w);
  });
  it("keeps share + download, exports an exact-size off-screen canvas, reuses the existing phones", () => {
    const page = read("app/share/page.tsx"), canvas = read("components/studio/StudioCanvas.tsx");
    expect(page).toContain("toBlob"); expect(page).toContain("navigator.share"); expect(page).toContain('run(format, "download")'); expect(page).toContain("runAll");
    expect(page).toContain("position: \"fixed\", left: -100000"); expect(page).toContain("pixelRatio: 1");
    expect(canvas).toContain('from "@/components/home/HeroPhone"'); expect(canvas).toContain('from "@/components/home/InvestorPhone"');
    expect(canvas).toContain("LanguageOverride"); expect(canvas).toContain('dir={rtl ? "rtl" : "ltr"}');
    expect(read("app/share/layout.tsx")).toContain("Noto_Sans_Arabic");
  });
  it("does not modify the homepage or Investor phone components", () => {
    expect(read("components/home/HeroPhone.tsx")).toContain("PHONE-v1");
    expect(read("components/home/InvestorPhone.tsx")).toContain("HOME-PHONE-v1");
  });
});
