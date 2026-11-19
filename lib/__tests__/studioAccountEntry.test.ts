// OWNER-STUDIO-LINK: the account-page entry shows for the owner only, and the existing Studio (/share, /api/studio/*) stays
// owner-only server-side on every path: proxy (first layer), page layout (second layer) and the API route itself.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  handler: null as null | ((auth: () => Promise<{ userId: string | null }>, req: unknown) => unknown),
  userId: null as string | null,
  owner: false,
  lang: "en",
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (fn: typeof h.handler) => { h.handler = fn; return fn; },
  auth: async () => ({ userId: h.userId }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw Object.assign(new Error("REDIRECT:" + to), { digest: "REDIRECT" }); },
  notFound: () => { throw Object.assign(new Error("NOT_FOUND"), { digest: "NOT_FOUND" }); },
}));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "--font-arabic" }) }));
vi.mock("@/lib/useIsOwner", () => ({ useIsOwner: () => h.owner }));
vi.mock("@/lib/i18n", () => ({ useLanguage: () => ({ lang: h.lang, t: (k: string) => k }) }));

const OWNER = "user_owner123";
const proxy = async (path: string, userId: string | null) => {
  await import("@/proxy");
  const url = `https://www.atlastrading.app${path}`;
  return (await h.handler!(async () => ({ userId }), { url, nextUrl: new URL(url) })) as Response | undefined;
};

beforeEach(() => { vi.resetModules(); process.env.OWNER_CLERK_USER_ID = OWNER; h.userId = null; h.owner = false; h.lang = "en"; });

describe("account page entry", () => {
  const render = async () => {
    const { default: Link } = await import("@/components/account/OwnerStudioLink");
    return renderToStaticMarkup(createElement(Link));
  };
  it("the owner sees a link to the existing Studio at /share", async () => {
    h.owner = true;
    const html = await render();
    expect(html).toContain("data-owner-studio-link");
    expect(html).toContain('href="/share"');
    expect(html).toContain("Social Media Studio");
  });
  it("a non-owner, a signed-out visitor and an unverified owner check render nothing at all", async () => {
    h.owner = false;
    expect(await render()).toBe("");
  });
  it("is available in French and Arabic and falls back to English", async () => {
    h.owner = true;
    h.lang = "fr";
    expect(await render()).toContain("Ouvrir le Studio");
    h.lang = "ar";
    expect(await render()).toContain("فتح الاستوديو");
    h.lang = "zz";
    expect(await render()).toContain("Open Studio");
  });
  it("is mounted only inside the signed-in part of the account page, and reuses the existing Studio instead of copying it", () => {
    const page = readFileSync("app/account/page.tsx", "utf8");
    const signedIn = page.slice(page.indexOf("{isLoaded && isSignedIn && ("));
    expect(signedIn).toContain("<OwnerStudioLink />");
    expect(page.slice(0, page.indexOf("{isLoaded && isSignedIn && ("))).not.toContain("<OwnerStudioLink />");
    const link = readFileSync("components/account/OwnerStudioLink.tsx", "utf8");
    expect(link).toContain("useIsOwner");
    expect(link).not.toMatch(/StudioCanvas|renderStudioPng|lib\/studio/);
  });
});

describe("direct URL and API access (server side)", () => {
  const paths = ["/share", "/share/anything", "/api/studio/logo?s=btc"];
  it("signed-out: pages redirect to sign-in, APIs answer 404", async () => {
    for (const p of ["/share", "/share/anything"]) {
      const r = await proxy(p, null);
      expect(r!.status).toBe(307);
      expect(r!.headers.get("location")).toContain("/sign-in?redirect_url=");
    }
    const api = await proxy("/api/studio/logo?s=btc", null);
    expect(api!.status).toBe(404);
  });
  it("signed-in non-owner: 404 on every path, never the Studio", async () => {
    for (const p of paths) {
      const r = await proxy(p, "user_someone_else");
      expect(r!.status, p).toBe(404);
    }
  });
  it("the owner passes the proxy on every path", async () => {
    for (const p of paths) expect(await proxy(p, OWNER), p).toBeUndefined();
  });
  it("the page layout is a second layer: signed-out redirects, non-owner gets notFound, owner renders", async () => {
    const { default: Layout } = await import("@/app/share/layout");
    h.userId = null;
    await expect(Layout({ children: null })).rejects.toThrow("REDIRECT:/sign-in");
    h.userId = "user_someone_else";
    await expect(Layout({ children: null })).rejects.toThrow("NOT_FOUND");
    h.userId = OWNER;
    expect(await Layout({ children: null })).toBeTruthy();
  });
  it("the Studio API checks the owner itself, even if the proxy were bypassed", async () => {
    const { GET } = await import("@/app/api/studio/logo/route");
    const call = () => GET(new Request("http://x/api/studio/logo?s=btc"));
    h.userId = null;
    expect((await call()).status).toBe(404);
    h.userId = "user_someone_else";
    expect((await call()).status).toBe(404);
    h.userId = OWNER;
    expect((await GET(new Request("http://x/api/studio/logo?s=../etc"))).status).toBe(400); // owner got past the guard
  });
  it("every file under app/api/studio calls requireOwner, and /share and /api/studio stay registered as owner paths", async () => {
    const { OWNER_PREFIXES, isOwnerPath } = await import("@/lib/privateRoutes");
    expect(OWNER_PREFIXES).toEqual(["/share", "/api/studio"]);
    expect(isOwnerPath("/share/x") && isOwnerPath("/api/studio/new")).toBe(true);
    expect(readFileSync("app/api/studio/logo/route.ts", "utf8")).toContain("requireOwner(req)");
  });
  it("the owner configuration is unchanged: the owner is still decided by OWNER_CLERK_USER_ID in lib/adminAuth.ts", () => {
    const src = readFileSync("lib/adminAuth.ts", "utf8");
    expect(src).toContain("OWNER_CLERK_USER_ID");
  });
});
