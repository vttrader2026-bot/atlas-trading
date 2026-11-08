// ACCESS-v1: logged-out visitors can never reach personal Journal / Dashboard data.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { isPrivatePath, signInRedirectPath } from "@/lib/privateRoutes";

const h = vi.hoisted(() => ({ handler: null as null | ((auth: () => Promise<{ userId: string | null }>, req: unknown) => unknown) }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (fn: typeof h.handler) => {
    h.handler = fn;
    return fn;
  },
}));

const run = async (path: string, userId: string | null, search = "") => {
  await import("@/proxy");
  const url = `https://www.atlastrading.app${path}${search}`;
  const req = { url, nextUrl: new URL(url) };
  return (await h.handler!(async () => ({ userId }), req)) as Response | undefined;
};

describe("server-side route protection", () => {
  beforeEach(() => vi.resetModules());

  it("redirects a logged-out visitor from /journal to sign-in, keeping the return path", async () => {
    const res = await run("/journal", null, "?x=1");
    expect(res).toBeDefined();
    expect(res!.status).toBe(307);
    const loc = new URL(res!.headers.get("location")!);
    expect(loc.pathname).toBe("/sign-in");
    expect(loc.searchParams.get("redirect_url")).toBe("/journal?x=1");
  });
  it("also protects sub-paths", async () => {
    expect((await run("/journal/anything", null))!.status).toBe(307);
  });
  it("lets an authenticated user through", async () => {
    expect(await run("/journal", "user_1")).toBeUndefined();
  });
  it("keeps /workflow and other public pages public", async () => {
    for (const p of ["/workflow", "/", "/radar", "/academy", "/trade-feed"]) expect(await run(p, null)).toBeUndefined();
  });
  it("protects /investor the same way (INVESTOR-v1)", async () => {
    const res = await run("/investor", null);
    expect(res!.status).toBe(307);
    expect(new URL(res!.headers.get("location")!).searchParams.get("redirect_url")).toBe("/investor");
    expect(await run("/investor", "user_1")).toBeUndefined();
    expect(isPrivatePath("/investor/x")).toBe(true);
  });
  it("path helpers", () => {
    expect(isPrivatePath("/journal")).toBe(true);
    expect(isPrivatePath("/journalism")).toBe(false);
    expect(signInRedirectPath("/journal")).toBe("/sign-in?redirect_url=%2Fjournal");
  });
});

describe("Workflow page shows nothing personal when logged out", () => {
  const page = readFileSync("app/workflow/page.tsx", "utf8");
  it("reads Journal, plan and analysis data only for a signed-in user", () => {
    const effect = page.slice(page.indexOf("ACCESS-v1"), page.indexOf("if (!isLoaded || !isSignedIn) return;"));
    expect(effect).toMatch(/if \(isSignedIn\) \{\s*setTrades\(loadTrades\(\)\)/);
    expect(effect).toContain("setTrades([])");
  });
  it("renders status lines (counts, win rate) only when authenticated", () => {
    expect(page).toContain("const showActivity = mounted && isLoaded && !!isSignedIn;");
    expect(page).toMatch(/\{showActivity && s\.status && \(/);
  });
});
