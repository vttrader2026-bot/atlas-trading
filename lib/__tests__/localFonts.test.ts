// FONTS-LOCAL-v1: the build must not need fonts.googleapis.com. Inter, Sora, JetBrains Mono and Noto Sans Arabic are
// self-hosted from app/fonts with the same CSS variables, variable weight ranges and subsets as before.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(f, "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "__tests__", "fonts"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(tsx?|css|mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("self-hosted fonts", () => {
  it("nothing in the app imports next/font/google or fetches Google Fonts", () => {
    for (const f of [...walk("app"), ...walk("components"), ...walk("lib"), "next.config.ts"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/next\/font\/google/);
      expect(src, f).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    }
  });
  it("the four font files exist and are real woff2 (wOF2) files of a sensible size, with their licenses", () => {
    for (const f of ["inter-latin-wght-normal", "sora-latin-wght-normal", "jetbrains-mono-latin-wght-normal", "noto-sans-arabic-arabic-wght-normal"]) {
      const p = `app/fonts/${f}.woff2`;
      expect(existsSync(p), p).toBe(true);
      expect(statSync(p).size, p).toBeGreaterThan(20_000);
      expect(readFileSync(p).subarray(0, 4).toString("latin1"), p).toBe("wOF2");
    }
    for (const l of ["inter", "sora", "jetbrains-mono", "noto-sans-arabic"]) expect(read(`app/fonts/LICENSE-${l}.txt`)).toContain("SIL Open Font License");
  });
  it("the root layout keeps the same three families, CSS variables, weight ranges and class wiring", () => {
    const s = read("app/layout.tsx");
    expect(s).toContain('import localFont from "next/font/local"');
    for (const [file, variable, weight] of [["inter", "--font-sans", "100 900"], ["sora", "--font-heading-family", "100 800"], ["jetbrains-mono", "--font-jetbrains-mono", "100 800"]]) {
      expect(s).toContain(`src: "./fonts/${file}-latin-wght-normal.woff2"`);
      expect(s).toContain(`variable: "${variable}"`);
      expect(s).toContain(`weight: "${weight}"`);
    }
    expect(s).toContain("${inter.variable} ${sora.variable} ${jetbrainsMono.variable} antialiased");
    expect((s.match(/display: "swap"/g) ?? []).length).toBe(3);
  });
  it("the Share route keeps Noto Sans Arabic (arabic subset, weights 500-800) on --font-arabic", () => {
    const s = read("app/share/layout.tsx");
    expect(s).toContain('src: "../fonts/noto-sans-arabic-arabic-wght-normal.woff2"');
    expect(s).toContain('weight: "500 800"');
    expect(s).toContain('variable: "--font-arabic"');
    expect(s).toContain("className={notoArabic.variable}");
    expect(read("app/globals.css")).toMatch(/--font-heading-family|--font-sans/);
  });
  it("every font path used in a layout points at an existing file", () => {
    for (const [layout, base] of [["app/layout.tsx", "app"], ["app/share/layout.tsx", "app/share"]]) {
      for (const m of read(layout).matchAll(/src: "(\.{1,2}\/[^"]+)"/g)) expect(existsSync(join(base, m[1])), `${layout} -> ${m[1]}`).toBe(true);
    }
  });
});
