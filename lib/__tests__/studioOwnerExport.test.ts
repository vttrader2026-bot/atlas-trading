// OWNER-ONLY-v1 + STUDIO-EXPORT-v2
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { isOwnerPath } from "@/lib/privateRoutes";
import { TRANSPARENT_PNG, describeExportError, pngSize, StudioExportError, renderStudioPng } from "@/lib/studioExport";

const h = vi.hoisted(() => ({ handler: null as null | ((auth: () => Promise<{ userId: string | null }>, req: unknown) => unknown), userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (fn: typeof h.handler) => { h.handler = fn; return fn; },
  auth: async () => ({ userId: h.userId }),
}));
const redirectMock = vi.hoisted(() => vi.fn((to: string) => { throw Object.assign(new Error("REDIRECT:" + to), { digest: "REDIRECT" }); }));
const notFoundMock = vi.hoisted(() => vi.fn(() => { throw Object.assign(new Error("NOT_FOUND"), { digest: "NOT_FOUND" }); }));
vi.mock("next/navigation", () => ({ redirect: redirectMock, notFound: notFoundMock }));
vi.mock("next/font/google", () => ({ Noto_Sans_Arabic: () => ({ variable: "--font-arabic" }) }));

const OWNER = "user_owner123";
const run = async (path: string, userId: string | null) => {
  await import("@/proxy");
  const url = `https://www.atlastrading.app${path}`;
  return (await h.handler!(async () => ({ userId }), { url, nextUrl: new URL(url) })) as Response | undefined;
};

beforeEach(() => { vi.resetModules(); process.env.OWNER_CLERK_USER_ID = OWNER; h.userId = null; redirectMock.mockClear(); notFoundMock.mockClear(); });

describe("owner-only /share: proxy (first layer)", () => {
  it("owner passes", async () => { expect(await run("/share", OWNER)).toBeUndefined(); });
  it("signed-out visitor is redirected to sign-in and returns to /share afterwards", async () => {
    const res = await run("/share", null);
    expect(res!.status).toBe(307);
    const loc = new URL(res!.headers.get("location")!);
    expect(loc.pathname).toBe("/sign-in"); expect(loc.searchParams.get("redirect_url")).toBe("/share");
  });
  it("signed-in non-owner gets a 404 rewrite, never the page", async () => {
    const res = await run("/share", "user_someone_else");
    expect(res!.status).toBe(404);
    expect(res!.headers.get("x-middleware-rewrite")).toContain("/not-found-owner-only");
  });
  it("fails closed when OWNER_CLERK_USER_ID is unset", async () => {
    delete process.env.OWNER_CLERK_USER_ID;
    expect((await run("/share", OWNER))!.status).toBe(404);
  });
  it("the studio API answers 404 JSON (not a redirect) to strangers and passes the owner", async () => {
    expect((await run("/api/studio/logo?s=btc", null))!.status).toBe(404);
    expect((await run("/api/studio/logo?s=btc", "user_x"))!.status).toBe(404);
    expect(await run("/api/studio/logo?s=btc", OWNER)).toBeUndefined();
  });
  it("other pages are unaffected", async () => {
    expect(await run("/radar", null)).toBeUndefined(); expect(await run("/academy", "user_x")).toBeUndefined();
    expect((await run("/journal", null))!.status).toBe(307);
    expect(isOwnerPath("/share")).toBe(true); expect(isOwnerPath("/shared")).toBe(false); expect(isOwnerPath("/radar")).toBe(false);
  });
});

describe("owner-only /share: server layout (second layer)", () => {
  const layout = async (userId: string | null) => { h.userId = userId; return (await import("@/app/share/layout")).default({ children: null }); };
  it("owner renders", async () => { await expect(layout(OWNER)).resolves.toBeTruthy(); expect(redirectMock).not.toHaveBeenCalled(); expect(notFoundMock).not.toHaveBeenCalled(); });
  it("signed-out redirects to sign-in", async () => { await expect(layout(null)).rejects.toThrow("REDIRECT:/sign-in?redirect_url=%2Fshare"); });
  it("non-owner gets notFound", async () => { await expect(layout("user_other")).rejects.toThrow("NOT_FOUND"); });
});

describe("studio logo proxy route", () => {
  const call = async (userId: string | null, q = "btc") => { h.userId = userId; return (await import("@/app/api/studio/logo/route")).GET(new Request("https://www.atlastrading.app/api/studio/logo?s=" + q)); };
  it("is owner-only (404 for strangers, nothing fetched)", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect((await call(null)).status).toBe(404); expect((await call("user_x")).status).toBe(404);
    expect(f).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
  it("validates the symbol and only ever fetches the fixed logo host", async () => {
    const f = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } })); vi.stubGlobal("fetch", f);
    expect((await call(OWNER, "../../etc/passwd")).status).toBe(400);
    expect((await call(OWNER, "a".repeat(40))).status).toBe(400);
    const ok = await call(OWNER, "BTC");
    expect(ok.status).toBe(200); expect(ok.headers.get("content-type")).toBe("image/png");
    expect(f).toHaveBeenCalledTimes(1); expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://assets.coincap.io/assets/icons/btc@2x.png");
    vi.unstubAllGlobals();
  });
  it("reports upstream failures instead of faking an image", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 404 })));
    expect((await call(OWNER)).status).toBe(404);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await call(OWNER)).status).toBe(502); vi.unstubAllGlobals();
  });
});

describe("export pipeline", () => {
  it("describes the bare Event that html-to-image rejects with (the original failure) and other errors", () => {
    expect(describeExportError({ type: "error", target: { src: "https://assets.coincap.io/assets/icons/btc@2x.png" } })).toContain("coincap");
    expect(describeExportError({ type: "error" })).toContain('"error"');
    expect(describeExportError(new Error("boom"))).toBe("boom"); expect(describeExportError("x")).toBe("x"); expect(describeExportError(undefined)).toBe("unknown error");
  });
  it("reads real PNG sizes and rejects non-PNG data; the transparent placeholder is a valid PNG", () => {
    const b = Buffer.from(TRANSPARENT_PNG.split(",")[1], "base64");
    expect(pngSize(new Uint8Array(b))).toEqual({ w: 1, h: 1 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull(); expect(pngSize(new Uint8Array(40))).toBeNull();
  });
  it("refuses to export without a mounted canvas and names the stage", async () => {
    await expect(renderStudioPng(null, 1080, 1920)).rejects.toMatchObject({ stage: "mount" });
    await expect(renderStudioPng(null, 1080, 1920)).rejects.toBeInstanceOf(StudioExportError);
  });
  it("all three actions share ONE pipeline and never hide the real error", () => {
    const page = readFileSync("app/share/page.tsx", "utf8");
    expect(page.match(/renderStudioPng\(/g)!.length).toBe(1);
    expect(page).not.toContain("toBlob("); expect(page).toContain("describeExportError"); expect(page).toContain("console.error");
    expect(page).toMatch(/run\(format, "share"\)[\s\S]*run\(format, "download"\)[\s\S]*runAll/);
    expect(page).toContain("failed.length"); // download-all reports partial failure
    const lib = readFileSync("lib/studioExport.ts", "utf8");
    expect(lib).toContain("/api/studio/logo"); expect(lib).toContain("imagePlaceholder"); expect(lib).toContain("expected ${w}x${h}");
  });
  it("the Share link is gone from the public footer", () => { expect(readFileSync("components/Footer.tsx", "utf8")).not.toContain('"/share"'); });
});
