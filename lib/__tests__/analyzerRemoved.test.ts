// ANALYZER-REMOVED-v1: FREE and ATLAS ELITE are the only plans. The AI Analyzer itself is untouched.
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Meta = Record<string, unknown>;
const h = vi.hoisted(() => ({ userId: "u1" as string | null, meta: {} as Meta, hashes: {} as Record<string, Record<string, unknown>>, sent: [] as string[] }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: h.userId }),
  clerkClient: async () => ({ users: { getUser: async () => ({ privateMetadata: h.meta }) } }),
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async hset(k: string, o: Record<string, unknown>) { h.hashes[k] = { ...(h.hashes[k] ?? {}), ...o }; return 1; }
  },
}));
vi.mock("@/lib/telegram", () => ({ sendPaymentProofToAdmin: async (_p: string, caption: string) => { h.sent.push(caption); } }));

import { POST as paymentsPOST } from "@/app/api/payments/route";
import { analyzeLimitForPlan, analyzeLimitReachedMessage, effectivePlan, getUserPlan } from "@/lib/plan";
import { memberState } from "@/lib/membership";
import { WATCHLIST_LIMITS, watchlistLimit } from "@/lib/watchlistConfig";
import { dictionaries } from "@/lib/i18n";

const ROOT = join(__dirname, "..", "..");

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = "https://fake";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake";
  h.userId = "u1";
  h.meta = {};
  h.hashes = {};
  h.sent = [];
});

describe("old Analyzer accounts are simply FREE and nothing breaks", () => {
  it("the retired 'analyzer' plan value is FREE everywhere (plan, limits, watchlist, dashboard state)", async () => {
    h.meta = { plan: "analyzer" };
    expect(effectivePlan(h.meta)).toBe("free");
    expect(await getUserPlan("u1")).toBe("free");
    expect(analyzeLimitForPlan(await getUserPlan("u1"))).toBe(3);
    expect(watchlistLimit("analyzer")).toBe(WATCHLIST_LIMITS.free);
    expect(memberState({ plan: "analyzer" }, Date.now())).toBe("free");
  });
  it("only FREE (3/day, 10 coins) and ELITE (20/day, 50 coins) remain", () => {
    expect(analyzeLimitForPlan("free")).toBe(3);
    expect(analyzeLimitForPlan("elite")).toBe(20);
    expect(WATCHLIST_LIMITS).toEqual({ free: 10, elite: 50 });
    expect(watchlistLimit("elite")).toBe(50);
    expect(watchlistLimit(undefined)).toBe(10);
  });
});

describe("daily-limit message promotes ATLAS ELITE", () => {
  it("FREE: explains the limit and points to ATLAS ELITE; ELITE: no upsell", () => {
    const free = analyzeLimitReachedMessage("free", 3);
    expect(free).toMatch(/3 free analyses/);
    expect(free).toMatch(/midnight UTC/);
    expect(free).toMatch(/ATLAS ELITE/);
    expect(free).toMatch(/20 a day/);
    expect(free).not.toMatch(/Analyzer Pro/i);
    expect(analyzeLimitReachedMessage("elite", 20)).not.toMatch(/upgrade/i);
  });
});

describe("payments: ATLAS ELITE is the only thing that can be bought", () => {
  const submit = (body: Record<string, unknown>) => paymentsPOST(new Request("http://x/api/payments", { method: "POST", body: JSON.stringify({ amount: "14.99", method: "usdt", proof: "data:image/png;base64,AA", telegramUsername: "@a", ...body }) }) as never);
  it("rejects the old analyzer plan and unknown plans, stores nothing", async () => {
    for (const plan of ["analyzer", "pro", "free", 5]) expect((await submit({ plan })).status, String(plan)).toBe(400);
    expect(h.hashes["payments:requests"]).toBeUndefined();
    expect(h.sent).toEqual([]);
  });
  it("accepts a request with no plan (older clients) or plan 'elite' and records it as ELITE", async () => {
    for (const body of [{}, { plan: "elite" }]) {
      h.hashes = {};
      h.sent = [];
      const res = await submit(body);
      expect(res.status).toBe(200);
      expect(Object.values(h.hashes["payments:requests"])[0]).toMatchObject({ plan: "elite", status: "pending", userId: "u1" });
      expect(h.sent[0]).toContain("Atlas Elite");
      expect(h.sent[0]).not.toMatch(/Analyzer/i);
    }
  });
});

describe("translations", () => {
  type Dict = Record<string, unknown>;
  const analyzerDict = (l: "en" | "ar" | "fr") => dictionaries[l].analyzer as Dict;
  it("EN, FR and AR have the new limit texts and none of the Analyzer Pro keys", () => {
    for (const l of ["en", "ar", "fr"] as const) {
      const a = analyzerDict(l);
      for (const k of ["limitReachedTitle", "limitUpgradeBody", "limitUpgradeCta", "limitEliteBody", "limitReached"]) expect(typeof a[k] === "string" && (a[k] as string).trim().length > 0, `${l}.${k}`).toBe(true);
      for (const k of ["proTitle", "proBody", "proPrice", "proMru", "proPerMonth", "proPerks", "proCta", "proEliteLink", "limitReachedCta"]) expect(a[k], `${l}.${k}`).toBeUndefined();
      expect((dictionaries[l] as Dict).proSection).toBeUndefined();
      expect(String(a.limitUpgradeBody)).toMatch(/3/);
      expect(String(a.limitUpgradeBody)).toMatch(/20/);
      expect(String(a.limitUpgradeBody)).toMatch(/ELITE/);
      expect(String(a.limitUpgradeCta)).toMatch(/ELITE/);
    }
  });
  it("no language still talks about Analyzer Pro or its price", () => {
    for (const l of ["en", "ar", "fr"] as const) {
      const all = JSON.stringify(dictionaries[l]);
      expect(all).not.toMatch(/Analyzer Pro/i);
      expect(all).not.toContain("$4.99");
      expect(all).not.toContain("250 MRU");
    }
  });
  it("the watchlist upsell names Atlas Elite only", () => {
    for (const l of ["en", "ar", "fr"] as const) expect(String((dictionaries[l].watchlist as Dict).elitePitch)).toMatch(/Atlas Elite/);
  });
});

describe("no Analyzer subscription is left in the app source", () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const f of readdirSync(dir)) {
      if (f === "node_modules" || f === ".next" || f === "__tests__") continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(f)) out.push(p);
    }
    return out;
  };
  const files = ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)));
  const hits = (re: RegExp) => files.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => f.slice(ROOT.length + 1));
  it("no Analyzer Pro / $4.99 / ?plan=analyzer / PaidPlan anywhere", () => {
    expect(hits(/Analyzer Pro/i)).toEqual([]);
    expect(hits(/(?<!\d)4\.99/)).toEqual([]);
    expect(hits(/plan=analyzer/)).toEqual([]);
    expect(hits(/PaidPlan|isPaidPlan|PAID_PLANS|planAnalyzerApproval|proSection/)).toEqual([]);
  });
  it("the upgrade button on the Analyzer page goes to the existing ATLAS ELITE flow (/elite)", () => {
    const page = readFileSync(join(ROOT, "app/analyzer/page.tsx"), "utf8");
    expect(page).toContain('href="/elite"');
    expect(page).toContain("analyzer.limitUpgradeCta");
  });
  it("the /elite page has no plan picker and always submits ELITE", () => {
    const page = readFileSync(join(ROOT, "app/elite/page.tsx"), "utf8");
    expect(page).not.toMatch(/setPlan|PlanChoice|useSearchParams/);
    expect(page).toContain('plan: "elite"');
  });
});
