import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { LANG_BOOT_FAILSAFE_MS, LANG_BOOT_SCRIPT, LANG_PENDING_ATTR, LANG_STORAGE_KEY, settleLangPending, syncDocumentLang } from "@/lib/i18n/boot";
import { createLanguageController } from "@/lib/i18n/controller";
import { dictionaries } from "@/lib/i18nDictionaries";
import type { Dict, Lang } from "@/lib/i18n/types";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function fakeDoc() {
  const attrs = new Map<string, string>();
  return {
    lang: "en",
    dir: "ltr",
    hasAttribute: (n: string) => attrs.has(n),
    removeAttribute: (n: string) => void attrs.delete(n),
    setAttribute: (n: string, v: string) => void attrs.set(n, v),
    attrs,
  };
}

/** Runs the real boot script against a fake page. `storage` is the saved value, or "throws" / "blocked". */
function boot(storage: string | null | "throws" | "blocked") {
  const doc = fakeDoc();
  const timers: { fn: () => void; ms: number }[] = [];
  const window = {} as { localStorage?: unknown };
  if (storage === "blocked") Object.defineProperty(window, "localStorage", { get() { throw new Error("SecurityError"); } });
  else window.localStorage = { getItem: (k: string) => { if (storage === "throws") throw new Error("denied"); expect(k).toBe("atlas-trading.lang"); return storage; } };
  vm.runInNewContext(LANG_BOOT_SCRIPT, { document: { documentElement: doc }, window, setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }) });
  return { doc, timers };
}

describe("boot script: first paint", () => {
  it("uses the same storage key as the provider", () => {
    expect(LANG_STORAGE_KEY).toBe("atlas-trading.lang");
    expect(read("lib/i18n.tsx")).toContain("LANG_STORAGE_KEY");
  });
  it("English, no preference and invalid values do nothing at all (no pending state, no timer)", () => {
    for (const v of ["en", null, "", "de", "AR", "fr ", "{}"]) {
      const { doc, timers } = boot(v);
      expect(doc.lang, String(v)).toBe("en");
      expect(doc.dir).toBe("ltr");
      expect(doc.attrs.size).toBe(0);
      expect(timers).toHaveLength(0);
    }
  });
  it("Arabic: lang=ar dir=rtl immediately and the page is pending", () => {
    const { doc } = boot("ar");
    expect([doc.lang, doc.dir, doc.attrs.get(LANG_PENDING_ATTR)]).toEqual(["ar", "rtl", "ar"]);
  });
  it("French: lang=fr dir=ltr immediately and the page is pending", () => {
    const { doc } = boot("fr");
    expect([doc.lang, doc.dir, doc.attrs.get(LANG_PENDING_ATTR)]).toEqual(["fr", "ltr", "fr"]);
  });
  it("inaccessible or throwing localStorage is harmless", () => {
    for (const v of ["throws", "blocked"] as const) {
      const { doc, timers } = boot(v);
      expect(doc.lang).toBe("en");
      expect(doc.attrs.size).toBe(0);
      expect(timers).toHaveLength(0);
    }
  });
  it("is small, plain ES5 and does not depend on anything", () => {
    expect(LANG_BOOT_SCRIPT.length).toBeLessThan(700);
    expect(LANG_BOOT_SCRIPT).not.toMatch(/=>|`|\blet\b|\bconst\b|import\(|fetch\(/);
  });
});

describe("pending state", () => {
  it("while the dictionary loads, the initial English state does not undo lang/dir; the loaded language ends pending", () => {
    const { doc } = boot("ar");
    syncDocumentLang(doc, "en", false); // provider's first effect, before the chunk has arrived
    expect([doc.lang, doc.dir, doc.attrs.has(LANG_PENDING_ATTR)]).toEqual(["ar", "rtl", true]);
    syncDocumentLang(doc, "ar", false); // dictionary applied
    expect([doc.lang, doc.dir, doc.attrs.has(LANG_PENDING_ATTR)]).toEqual(["ar", "rtl", false]);
  });
  it("English users: the provider effect behaves exactly as before", () => {
    const doc = fakeDoc();
    syncDocumentLang(doc, "en", false);
    expect([doc.lang, doc.dir, doc.attrs.size]).toEqual(["en", "ltr", 0]);
    syncDocumentLang(doc, "ar", true);
    expect([doc.lang, doc.dir]).toEqual(["ar", "rtl"]);
    syncDocumentLang(doc, "fr", true);
    expect([doc.lang, doc.dir]).toEqual(["fr", "ltr"]);
  });
  it("failed load: the page is revealed in English with matching lang/dir, never left hidden", () => {
    const { doc, timers } = boot("ar");
    settleLangPending(doc, "en");
    expect([doc.lang, doc.dir, doc.attrs.has(LANG_PENDING_ATTR)]).toEqual(["en", "ltr", false]);
    timers[0].fn(); // the failsafe firing later changes nothing
    expect([doc.lang, doc.dir]).toEqual(["en", "ltr"]);
  });
  it("settle does nothing when the page is not pending", () => {
    const doc = fakeDoc();
    doc.lang = "fr";
    settleLangPending(doc, "en");
    expect(doc.lang).toBe("fr");
  });
});

describe("failsafe", () => {
  it("is set once, at 4 s: long enough for a slow chunk, short enough to never be a prolonged blank page", () => {
    const { timers } = boot("ar");
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(LANG_BOOT_FAILSAFE_MS);
    expect(LANG_BOOT_FAILSAFE_MS).toBeGreaterThanOrEqual(3000);
    expect(LANG_BOOT_FAILSAFE_MS).toBeLessThanOrEqual(5000);
  });
  it("JS that never starts (or a chunk that never answers): the timer reveals the page in English with lang/dir to match", () => {
    const { doc, timers } = boot("ar");
    timers[0].fn();
    expect([doc.lang, doc.dir, doc.attrs.has(LANG_PENDING_ATTR)]).toEqual(["en", "ltr", false]);
  });
  it("does not touch a page that already finished loading its language", () => {
    const { doc, timers } = boot("fr");
    syncDocumentLang(doc, "fr", false);
    timers[0].fn();
    expect([doc.lang, doc.dir]).toEqual(["fr", "ltr"]);
  });
  it("a chunk that arrives after the failsafe still applies normally", () => {
    const { doc, timers } = boot("ar");
    timers[0].fn();
    syncDocumentLang(doc, "ar", false);
    expect([doc.lang, doc.dir, doc.attrs.has(LANG_PENDING_ATTR)]).toEqual(["ar", "rtl", false]);
  });
});

function harness(saved: string | null, load: (l: Lang) => Promise<Dict>) {
  const doc = fakeDoc();
  const warns: Lang[] = [];
  let userChose = false;
  const ctrl = createLanguageController({
    storageGet: () => saved,
    storageSet: (v) => { saved = v; },
    load,
    peek: (l) => (l === "en" ? dictionaries.en : undefined),
    apply: (s) => syncDocumentLang(doc, s.lang, userChose), // what the provider effect does
    warn: (l) => { warns.push(l); settleLangPending(doc, ctrl.current()); },
  });
  return { doc, warns, ctrl, choose: (l: Lang) => { userChose = true; return ctrl.setLang(l); } };
}
const gate = () => { let open!: () => void; const p = new Promise<void>((r) => (open = r)); return { p, open }; };

describe("end to end with the real controller", () => {
  it("successful load: pending until the dictionary is applied, then correct lang/dir", async () => {
    const g = gate();
    const h = harness("ar", async (l) => { await g.p; return dictionaries[l]; });
    const { doc } = boot("ar");
    Object.assign(h.doc, { lang: doc.lang, dir: doc.dir }); h.doc.setAttribute(LANG_PENDING_ATTR, "ar");
    const done = h.ctrl.restore();
    expect(h.doc.attrs.has(LANG_PENDING_ATTR)).toBe(true); // still hidden, still rtl
    expect(h.doc.dir).toBe("rtl");
    g.open(); await done;
    expect([h.doc.lang, h.doc.dir, h.doc.attrs.has(LANG_PENDING_ATTR)]).toEqual(["ar", "rtl", false]);
  });
  it("failed load: warns once, reveals English, keeps the saved preference", async () => {
    const h = harness("fr", () => Promise.reject(new Error("chunk 404")));
    h.doc.lang = "fr"; h.doc.setAttribute(LANG_PENDING_ATTR, "fr");
    await h.ctrl.restore();
    expect(h.warns).toEqual(["fr"]);
    expect([h.doc.lang, h.doc.dir, h.doc.attrs.has(LANG_PENDING_ATTR)]).toEqual(["en", "ltr", false]);
  });
  it("switching to French while Arabic is still loading: the late Arabic result is ignored", async () => {
    const ar = gate();
    const h = harness("ar", async (l) => { if (l === "ar") await ar.p; return dictionaries[l]; });
    h.doc.lang = "ar"; h.doc.dir = "rtl"; h.doc.setAttribute(LANG_PENDING_ATTR, "ar");
    const first = h.ctrl.restore();
    const second = h.choose("fr");
    await second;
    expect([h.doc.lang, h.doc.dir, h.doc.attrs.has(LANG_PENDING_ATTR)]).toEqual(["fr", "ltr", false]);
    ar.open(); await first;
    expect([h.doc.lang, h.doc.dir]).toEqual(["fr", "ltr"]); // not flipped back to Arabic
  });
  it("switching to English while a saved language loads reveals English immediately", async () => {
    const g = gate();
    const h = harness("ar", async (l) => { await g.p; return dictionaries[l]; });
    h.doc.lang = "ar"; h.doc.dir = "rtl"; h.doc.setAttribute(LANG_PENDING_ATTR, "ar");
    const first = h.ctrl.restore();
    await h.choose("en");
    expect([h.doc.lang, h.doc.dir, h.doc.attrs.has(LANG_PENDING_ATTR)]).toEqual(["en", "ltr", false]);
    g.open(); await first;
    expect(h.doc.lang).toBe("en");
  });
  it("a failure of an Arabic request that was already replaced does not reveal or revert anything", async () => {
    const ar = gate();
    const fr = gate();
    const h = harness("ar", async (l) => { if (l === "ar") { await ar.p; throw new Error("late failure"); } await fr.p; return dictionaries[l]; });
    h.doc.lang = "ar"; h.doc.dir = "rtl"; h.doc.setAttribute(LANG_PENDING_ATTR, "ar");
    const first = h.ctrl.restore();
    const second = h.choose("fr");
    ar.open(); await first;
    expect(h.warns).toEqual([]);
    expect(h.doc.attrs.has(LANG_PENDING_ATTR)).toBe(true); // French still loading: still hidden
    fr.open(); await second;
    expect([h.doc.lang, h.doc.attrs.has(LANG_PENDING_ATTR)]).toEqual(["fr", false]);
  });
  it("blocked storage inside the provider: nothing loads, the failsafe handles the page", async () => {
    const doc = fakeDoc();
    const ctrl = createLanguageController({ storageGet: () => { throw new Error("blocked"); }, storageSet: () => {}, load: () => Promise.reject(new Error("never")), peek: () => undefined, apply: () => {}, warn: () => {} });
    await expect(ctrl.restore()).resolves.toBeUndefined();
    expect(doc.attrs.size).toBe(0);
  });
});

describe("static prerendering is preserved", () => {
  const layout = read("app/layout.tsx");
  it("root layout does not use cookies()/headers() or force dynamic rendering", () => {
    expect(layout).not.toMatch(/next\/headers/);
    expect(layout).not.toMatch(/\bcookies\(|\bheaders\(/);
    expect(layout).not.toMatch(/force-dynamic|revalidate\s*=\s*0|unstable_noStore|noStore/);
    expect(layout).not.toMatch(/export default async function/);
  });
  it("the boot script is inlined in <head> and hydration of <html> is allowed to differ", () => {
    expect(layout).toMatch(/<html lang="en" suppressHydrationWarning>/);
    expect(layout).toMatch(/<head>[\s\S]*LANG_BOOT_SCRIPT[\s\S]*<\/head>/);
  });
  it("the hide rule only applies while pending, uses visibility (keeps layout) and is the only such rule", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/html\[data-lang-pending\] body\s*\{\s*visibility:\s*hidden;\s*\}/);
    expect(css).not.toMatch(/data-lang-pending[^{]*\{[^}]*display:\s*none/);
    // it must be a rule of its own: glued to a neighbouring selector list ("html,\n html[data-lang-pending] body") it would hide every page
    const at = css.indexOf("html[data-lang-pending] body");
    expect(css.slice(0, at).trimEnd().endsWith(",")).toBe(false);
    expect(css.slice(0, at).trimEnd().endsWith("}") || css.slice(0, at).trimEnd().endsWith("*/")).toBe(true);
    expect(css.match(/data-lang-pending/g)).toHaveLength(1);
  });
  it("Batch 1 and Batch 2 integrations are still in place", () => {
    expect(layout).toContain("<LazyGlobals />");
    expect(layout).toContain("ClerkProvider");
    expect(layout).toContain("JournalSync");
    expect(layout).toContain("RegisterServiceWorker");
    const provider = read("lib/i18n.tsx");
    expect(provider).not.toMatch(/from "@\/lib\/i18n\/(ar|fr)"/);
    expect(read("lib/i18n/loader.ts")).toContain('import("./ar")');
  });
});
