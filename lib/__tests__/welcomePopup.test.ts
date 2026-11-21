// WELCOME-v1: "What brings you to Atlas?" popup: storage rules, recommendations, the real API route, rendering and wiring.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({ userId: "u1" as string | null, kv: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: h.userId }) }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async get(k: string) { return structuredClone(h.kv[k] ?? null); }
    async set(k: string, v: unknown) { h.kv[k] = structuredClone(v); return "OK"; }
  },
}));

import { GET, PUT } from "../../app/api/me/interest/route";
import { INTERESTS, RECOMMENDED, WELCOME_PATHS, normalizeInterest } from "../interest";
import { WelcomeView } from "../../components/WelcomePopup";

const read = (p: string) => readFileSync(p, "utf8");
const put = (b: unknown) => new Request("http://localhost/api/me/interest", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const j = async (r: Response) => (await r.json()) as Record<string, unknown>;
beforeEach(() => { h.userId = "u1"; h.kv = {}; process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io"; process.env.UPSTASH_REDIS_REST_TOKEN = "t"; });

describe("interest rules", () => {
  it("has the four options and the requested recommendations", () => {
    expect(INTERESTS).toEqual(["spot", "invest", "learn", "explore"]);
    expect(RECOMMENDED.spot.map((r) => r.href)).toEqual(["/analyzer", "/radar", "/trade-plan"]);
    expect(RECOMMENDED.invest.map((r) => r.href)).toEqual(["/market-intelligence", "/investor"]);
    expect(RECOMMENDED.learn.map((r) => r.href)).toEqual(["/academy", "/videos"]);
    expect(RECOMMENDED.learn[0].primary).toBe(true);
    expect(RECOMMENDED.explore).toEqual([]);
    for (const p of Object.values(RECOMMENDED).flat()) expect(p.href.startsWith("/")).toBe(true);
    expect(WELCOME_PATHS).toEqual(["/", "/workflow"]);
  });
  it("normalizes stored values", () => {
    expect(normalizeInterest(null)).toEqual({ interest: null, dismissed: false });
    expect(normalizeInterest({ interest: "spot", dismissed: true })).toEqual({ interest: "spot", dismissed: false });
    expect(normalizeInterest({ interest: "hacker" })).toEqual({ interest: null, dismissed: false });
    expect(normalizeInterest({ dismissed: true })).toEqual({ interest: null, dismissed: true });
  });
});

describe("/api/me/interest", () => {
  it("saves, reads back and overrides; dismissal is stored; bad input and signed-out are rejected", async () => {
    expect(await j(await GET())).toEqual({ interest: null, dismissed: false });
    expect((await PUT(put({ dismissed: true }))).status).toBe(200);
    expect(await j(await GET())).toEqual({ interest: null, dismissed: true });
    expect((await PUT(put({ interest: "learn" }))).status).toBe(200);
    expect(await j(await GET())).toEqual({ interest: "learn", dismissed: false });
    expect((await PUT(put({ interest: "nope" }))).status).toBe(400);
    expect((await PUT(put({}))).status).toBe(400);
    expect((await PUT(new Request("http://localhost/x", { method: "PUT", body: "{" }))).status).toBe(400);
    expect(h.kv["user:u1:interest"]).toEqual({ interest: "learn", dismissed: false });
    h.userId = null;
    expect((await GET()).status).toBe(401);
  });
  it("keeps each member's choice separate", async () => {
    await PUT(put({ interest: "spot" }));
    h.userId = "u2";
    expect(await j(await GET())).toEqual({ interest: null, dismissed: false });
  });
});

describe("WelcomeView", () => {
  const html = (o: Partial<Parameters<typeof WelcomeView>[0]> = {}) => renderToStaticMarkup(createElement(WelcomeView, { lang: "en", t: (k) => `«${k}»`, selected: null, step: "choose", onChoose() {}, onLater() {}, onDone() {}, ...o }));
  it("shows the title, four options and Maybe later in EN/AR/FR", () => {
    const en = html();
    for (const s of ["Welcome to Atlas Trading", "Welcome! Let&#x27;s personalize your Atlas experience. What brings you here today?", "Spot Trading", "Analyze markets and manage your trades.", "Long-term Investment", "Research and track your investments.", "Learning", "Learn cryptocurrency and technical analysis.", "Explore Everything", "Discover all Atlas features.", "Maybe later"]) expect(en).toContain(s);
    expect(en).toContain('role="dialog"'); expect(en).toContain('dir="ltr"');
    const ar = html({ lang: "ar" }); expect(ar).toContain('dir="rtl"'); expect(ar).toContain("مرحباً بك في أطلس ترايدينغ"); expect(ar).toContain("ما الذي يجذبك إلى هنا اليوم؟"); expect(ar).toContain("ربما لاحقاً");
    const fr = html({ lang: "fr" }); expect(fr).toContain("Bienvenue sur Atlas Trading"); expect(fr).toContain("Qu&#x27;est-ce qui vous amène aujourd&#x27;hui ?");
  });
  it("shows a Back button on the recommendations view (not on the choices), in EN/AR/FR, keeping the saved choice", () => {
    const done = (lang: "en" | "ar" | "fr") => html({ lang, step: "done", selected: "spot", onBack() {} });
    expect(done("en")).toContain("data-welcome-back"); expect(done("en")).toContain("Back");
    expect(done("ar")).toContain("رجوع"); expect(done("fr")).toContain("Retour");
    expect(html({ onBack() {} })).not.toContain("data-welcome-back");
    expect(html({ step: "done", selected: "explore", onBack() {} })).toContain("data-welcome-back");
    expect(html({ selected: "spot" })).toContain('aria-pressed="true"');
    const c = read("components/WelcomePopup.tsx");
    expect(c).toContain('onBack={() => setStep("choose")}');
    expect(c.slice(c.indexOf("const choose ="))).toContain("writeLocalInterest({ interest: i"); // choosing again re-saves the new interest
  });
  it("has an EN / FR / AR selector that marks the current language and switches through the site language setting", () => {
    const out = html({ lang: "fr", onLang() {} });
    for (const l of ["EN", "FR", "AR"]) expect(out).toContain(`>${l}</button>`);
    expect(out).toMatch(/aria-pressed="true"[^>]*>FR</);
    expect(html({ lang: "ar", onLang() {} })).toMatch(/aria-pressed="true"[^>]*>AR</);
    expect(html()).not.toContain("data-welcome-lang");
    const c = read("components/WelcomePopup.tsx");
    expect(c).toContain("setLang"); expect(c).toContain("onLang={setLang}");
  });
  it("recommends the right existing features after a choice, and nothing for Explore", () => {
    const spot = html({ step: "done", selected: "spot" });
    for (const href of ["/analyzer", "/radar", "/trade-plan"]) expect(spot).toContain(`href="${href}"`);
    expect(spot).toContain("«nav.analyzer»");
    expect(html({ step: "done", selected: "invest" })).toContain('href="/market-intelligence"');
    const learn = html({ step: "done", selected: "learn" });
    expect(learn).toContain('href="/academy"'); expect(learn).toContain('href="/videos"'); expect(learn).toContain("data-welcome-primary");
    expect(learn).toContain("Atlas Academy"); expect(learn).toContain("Start learning"); expect(learn).toContain("Watch Atlas Videos");
    expect(learn).not.toContain('href="/analyzer"'); expect(learn).not.toContain('href="/risk"');
    expect(learn.indexOf("/academy")).toBeLessThan(learn.indexOf("/videos"));
    expect(html({ lang: "ar", step: "done", selected: "learn" })).toContain("شاهد فيديوهات أطلس");
    expect(html({ lang: "fr", step: "done", selected: "learn" })).toContain("Regardez les vidéos Atlas");
    expect(html({ step: "done", selected: "spot" })).not.toContain("data-welcome-primary");
    expect(html({ step: "done", selected: "explore" })).not.toContain("href=");
    expect(html({ selected: "learn" })).toContain('aria-pressed="true"');
  });
});

describe("wiring", () => {
  it("is mounted site-wide, never blocks features, reuses account storage, and the footer can reopen it", () => {
    expect(read("app/layout.tsx")).toContain("<WelcomePopup />");
    const c = read("components/WelcomePopup.tsx");
    for (const s of ["/api/me/interest", "readLocalInterest", "writeLocalInterest", "INTEREST_EVENT", "Escape", "WELCOME_PATHS"]) expect(c).toContain(s);
    expect(c).not.toMatch(/router\.(push|replace)|redirect\(/);
    expect(read("components/Footer.tsx")).toContain("INTEREST_EVENT");
  });
});
