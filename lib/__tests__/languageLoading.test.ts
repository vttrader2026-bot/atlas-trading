import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { i18nSource } from "./helpers/i18nSource";
import { dictionaries } from "@/lib/i18nDictionaries";
import type { Dict, Lang } from "@/lib/i18n/types";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function flatten(d: Dict, prefix = "", out: string[] = []): string[] {
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string") out.push(prefix + k);
    else flatten(v, `${prefix}${k}.`, out);
  }
  return out;
}

async function freshModules() {
  vi.resetModules();
  const loader = await import("@/lib/i18n/loader");
  const controller = await import("@/lib/i18n/controller");
  return { loader, controller };
}

type Harness = {
  state: { lang: Lang; dict: Dict }[];
  store: { v: string | null };
  warns: Lang[];
  ctrl: ReturnType<Awaited<ReturnType<typeof freshModules>>["controller"]["createLanguageController"]>;
};

async function harness(saved: string | null, opts: { failing?: Lang[]; throwStorage?: boolean } = {}): Promise<Harness & { loader: Awaited<ReturnType<typeof freshModules>>["loader"] }> {
  const { loader, controller } = await freshModules();
  const state: Harness["state"] = [];
  const store = { v: saved };
  const warns: Lang[] = [];
  const ctrl = controller.createLanguageController({
    storageGet: () => { if (opts.throwStorage) throw new Error("blocked"); return store.v; },
    storageSet: (v) => { store.v = v; },
    load: (l) => (opts.failing?.includes(l) ? Promise.reject(new Error("network")) : loader.loadDict(l)),
    peek: loader.getLoadedDict,
    apply: (s) => state.push(s),
    warn: (l) => warns.push(l),
  });
  return { state, store, warns, ctrl, loader };
}

describe("dictionaries: no regression", () => {
  it("ar and fr contain every English key", () => {
    const en = flatten(dictionaries.en);
    expect(en.length).toBeGreaterThan(500);
    for (const l of ["ar", "fr"] as const) {
      const have = new Set(flatten(dictionaries[l]));
      expect(en.filter((k) => !have.has(k)), l).toEqual([]);
    }
  });
  it("loaded dictionaries equal the static ones", async () => {
    const { loader } = await freshModules();
    expect(await loader.loadDict("ar")).toStrictEqual(dictionaries.ar);
    expect(await loader.loadDict("fr")).toStrictEqual(dictionaries.fr);
  });
});

describe("loader", () => {
  it("english is available synchronously, others are not until loaded", async () => {
    const { loader } = await freshModules();
    expect(loader.getLoadedDict("en")).toBeDefined();
    expect(loader.getLoadedDict("ar")).toBeUndefined();
    expect(loader.getLoadedDict("fr")).toBeUndefined();
    await loader.loadDict("fr");
    expect(loader.getLoadedDict("fr")).toBeDefined();
    expect(loader.getLoadedDict("ar")).toBeUndefined();
  });
  it("shares one in-flight download", async () => {
    const { loader } = await freshModules();
    expect(loader.loadDict("ar")).toBe(loader.loadDict("ar"));
  });
  it("missing key falls back to English, then to the key", async () => {
    const { loader } = await freshModules();
    const en = { a: { b: "English B" }, only: "Only English" };
    const t = loader.makeT({ a: { b: "Arabe B" } }, "ar");
    expect(t("a.b")).toBe("Arabe B");
    expect(t("nav.home")).toBe(loader.lookup(dictionaries.en, "nav.home") ?? "nav.home");
    expect(t("definitely.missing.key")).toBe("definitely.missing.key");
    expect(en.only).toBeTruthy();
    expect(loader.makeT(dictionaries.en, "en")("definitely.missing.key")).toBe("definitely.missing.key");
  });
  it("a group path is not returned as text", async () => {
    const { loader } = await freshModules();
    expect(loader.lookup({ a: { b: "x" } }, "a")).toBeUndefined();
  });
});

describe("language controller", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("English startup downloads nothing and applies nothing", async () => {
    const h = await harness(null);
    await h.ctrl.restore();
    expect(h.state).toEqual([]);
    expect(h.loader.getLoadedDict("ar")).toBeUndefined();
    expect(h.loader.getLoadedDict("fr")).toBeUndefined();
  });
  it("saved Arabic loads only Arabic and applies lang+dict together", async () => {
    const h = await harness("ar");
    await h.ctrl.restore();
    expect(h.state).toHaveLength(1);
    expect(h.state[0].lang).toBe("ar");
    expect(h.state[0].dict).toStrictEqual(dictionaries.ar);
    expect(h.loader.getLoadedDict("fr")).toBeUndefined();
  });
  it("saved French loads only French", async () => {
    const h = await harness("fr");
    await h.ctrl.restore();
    expect(h.state[0].lang).toBe("fr");
    expect(h.state[0].dict).toStrictEqual(dictionaries.fr);
    expect(h.loader.getLoadedDict("ar")).toBeUndefined();
  });
  it("ignores an invalid saved value and blocked storage", async () => {
    const a = await harness("de");
    await a.ctrl.restore();
    const b = await harness(null, { throwStorage: true });
    await expect(b.ctrl.restore()).resolves.toBeUndefined();
    expect(a.state).toEqual([]);
    expect(b.state).toEqual([]);
  });
  it("switching to a loaded language is synchronous; saved preference survives a refresh", async () => {
    const h = await harness(null);
    await h.loader.loadDict("fr");
    h.ctrl.setLang("fr");
    expect(h.state.at(-1)?.lang).toBe("fr"); // no await: instant
    expect(h.store.v).toBe("fr");
    const refreshed = await harness(h.store.v);
    await refreshed.ctrl.restore();
    expect(refreshed.state[0].lang).toBe("fr");
  });
  it("keeps the old language until the new one has arrived (no flash), never an empty dict", async () => {
    const h = await harness(null);
    const pending = h.ctrl.setLang("ar");
    expect(h.state).toEqual([]);
    await pending;
    expect(h.state).toHaveLength(1);
    expect(Object.keys(h.state[0].dict).length).toBeGreaterThan(0);
  });
  it("the latest choice wins over a slower earlier one", async () => {
    const h = await harness(null);
    const first = h.ctrl.setLang("ar");
    const second = h.ctrl.setLang("fr");
    await Promise.all([first, second]);
    expect(h.state.map((s) => s.lang)).toEqual(["fr"]);
    expect(h.ctrl.current()).toBe("fr");
  });
  it("toggle cycles en → ar → fr → en", async () => {
    const h = await harness(null);
    await h.loader.loadDict("ar");
    await h.loader.loadDict("fr");
    h.ctrl.toggle(); h.ctrl.toggle(); h.ctrl.toggle();
    expect(h.state.map((s) => s.lang)).toEqual(["ar", "fr", "en"]);
  });
  it("load error: stays on the current language, warns, keeps the saved preference, and retries later", async () => {
    const h = await harness("ar", { failing: ["ar"] });
    await h.ctrl.restore();
    expect(h.state).toEqual([]);
    expect(h.warns).toEqual(["ar"]);
    expect(h.store.v).toBe("ar");
    expect(h.ctrl.current()).toBe("en");
    // network back: the same loader retries (failures are not cached)
    await expect(h.loader.loadDict("ar")).resolves.toStrictEqual(dictionaries.ar);
  });
  it("does not depend on download speed: a slow chunk still ends in the right state", async () => {
    const { loader, controller } = await freshModules();
    const applied: Lang[] = [];
    const ctrl = controller.createLanguageController({
      storageGet: () => "fr",
      storageSet: () => {},
      load: async (l) => { await new Promise((r) => setTimeout(r, 300)); return loader.loadDict(l); },
      peek: loader.getLoadedDict,
      apply: (s) => applied.push(s.lang),
      warn: () => {},
    });
    const done = ctrl.restore();
    expect(applied).toEqual([]); // still downloading: nothing applied, old language stays
    await done;
    expect(applied).toEqual(["fr"]);
  });
  it("dir is rtl only for Arabic", async () => {
    const { controller } = await freshModules();
    expect(controller.dirFor("ar")).toBe("rtl");
    expect(controller.dirFor("fr")).toBe("ltr");
    expect(controller.dirFor("en")).toBe("ltr");
  });
});

describe("provider wiring (source)", () => {
  const src = i18nSource();
  it("provider has no static ar/fr imports; only the loader holds lazy imports", () => {
    const provider = read("lib/i18n.tsx");
    expect(provider).not.toMatch(/from "@\/lib\/i18n\/(ar|fr)"/);
    expect(provider).not.toMatch(/from "\.\/i18n\/(ar|fr)"/);
    const loader = read("lib/i18n/loader.ts");
    expect(loader).toContain('import("./ar")');
    expect(loader).toContain('import("./fr")');
    expect(loader).not.toMatch(/^import .* from "\.\/(ar|fr)"/m);
  });
  it("starts in English, restores the saved key, sets lang and dir from state", () => {
    const provider = read("lib/i18n.tsx");
    expect(provider).toContain('useState<LangState>({ lang: "en"');
    expect(provider).toContain("atlas-trading.lang");
    expect(provider).toContain("c.restore()");
    expect(provider).toContain("document.documentElement.dir = state.lang");
    expect(src).toContain("export function LanguageProvider");
  });
  it("opening the language list prefetches the other languages", () => {
    expect(read("components/LanguageSelect.tsx")).toContain("preloadLanguages()");
  });
  it("context value is memoized", () => {
    const provider = read("lib/i18n.tsx");
    expect(provider).toContain("useMemo(() => makeT(state.dict, state.lang)");
  });
});
