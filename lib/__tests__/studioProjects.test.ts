// PROJECTS-v1: Studio saved designs: the REAL routes and store (only Clerk and Upstash are fakes), plus restore validation and wiring.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({ userId: "owner-1" as string | null, hashes: {} as Record<string, Record<string, unknown>> }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: h.userId }) }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async hgetall(k: string) { const v = h.hashes[k]; return v && Object.keys(v).length ? structuredClone(v) : null; }
    async hget(k: string, f: string) { return structuredClone(h.hashes[k]?.[f] ?? null); }
    async hset(k: string, o: Record<string, unknown>) { h.hashes[k] = { ...(h.hashes[k] ?? {}), ...structuredClone(o) }; return 1; }
    async hdel(k: string, f: string) { if (h.hashes[k] && f in h.hashes[k]) { delete h.hashes[k][f]; return 1; } return 0; }
  },
}));

import { GET as list, POST as create } from "../../app/api/studio/projects/route";
import { GET as open, PUT as update, DELETE as remove } from "../../app/api/studio/projects/[id]/route";
import { MAX_DATA_CHARS, MAX_PROJECTS, THUMB_PREFIX, metaKey, dataKey } from "../studioProjects";
import { restoreEnd, restorePhone, restoreThumb, defaultEndState, initialThumbSpec } from "../studioRestore";
import { isOwnerPath } from "../privateRoutes";

const req = (method: string, body?: unknown) => new Request("http://localhost/api/studio/projects", { method, headers: { "content-type": "application/json", host: "localhost", origin: "http://localhost" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const body = (name = "My design", extra: Record<string, unknown> = {}) => ({ type: "end", name, data: { tpl: "visit", lang: "ar" }, thumb: `${THUMB_PREFIX}AAAA`, ...extra });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response) => (await r.json()) as Record<string, any>;
const read = (p: string) => readFileSync(p, "utf8");

beforeEach(() => {
  h.userId = "owner-1"; h.hashes = {};
  process.env.OWNER_CLERK_USER_ID = "owner-1"; process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
});

describe("projects API", () => {
  it("saves, lists, reopens, updates, renames and deletes", async () => {
    const c = await create(req("POST", body()));
    expect(c.status).toBe(201);
    const { project } = await json(c);
    expect(project).toMatchObject({ type: "end", name: "My design" });
    expect((await json(await list())).projects).toHaveLength(1);
    expect((await json(await list())).projects[0]).not.toHaveProperty("data");
    const o = await json(await open(req("GET"), ctx(project.id)));
    expect(o.data).toEqual({ tpl: "visit", lang: "ar" });
    const u = await update(req("PUT", { data: { tpl: "watch" }, name: "Renamed" }), ctx(project.id));
    expect(u.status).toBe(200);
    const o2 = await json(await open(req("GET"), ctx(project.id)));
    expect(o2.data).toEqual({ tpl: "watch" }); expect(o2.project.name).toBe("Renamed"); expect(o2.project.updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
    expect((await update(req("PUT", { name: "Only name" }), ctx(project.id))).status).toBe(200);
    expect((await json(await open(req("GET"), ctx(project.id)))).data).toEqual({ tpl: "watch" }); // a rename keeps the data
    expect((await remove(req("DELETE"), ctx(project.id))).status).toBe(200);
    expect((await json(await list())).projects).toEqual([]);
    expect((await open(req("GET"), ctx(project.id))).status).toBe(404);
    expect(Object.keys(h.hashes[dataKey("owner-1")] ?? {})).toEqual([]);
  });
  it("lists newest first and caps the number of projects", async () => {
    const a = (await json(await create(req("POST", body("A"))))).project;
    await new Promise((r) => setTimeout(r, 5));
    await create(req("POST", body("B")));
    expect((await json(await list())).projects.map((p: { name: string }) => p.name)).toEqual(["B", "A"]);
    await update(req("PUT", { name: "A2" }), ctx(a.id));
    expect((await json(await list())).projects[0].name).toBe("A2");
    h.hashes[metaKey("owner-1")] = Object.fromEntries(Array.from({ length: MAX_PROJECTS }, (_, i) => [`x${i}`, { id: `x${i}`, type: "end", name: "n", thumb: "", createdAt: 1, updatedAt: 1 }]));
    expect((await create(req("POST", body("one too many")))).status).toBe(409);
  });
  it("is private per user and owner only", async () => {
    const { project } = await json(await create(req("POST", body())));
    h.userId = "someone-else"; process.env.OWNER_CLERK_USER_ID = "someone-else";
    expect((await json(await list())).projects).toEqual([]);
    expect((await open(req("GET"), ctx(project.id))).status).toBe(404);
    expect((await remove(req("DELETE"), ctx(project.id))).status).toBe(404);
    h.userId = "owner-1"; // no longer the owner
    expect((await list()).status).toBe(404); expect((await create(req("POST", body()))).status).toBe(404);
    h.userId = null; expect((await list()).status).toBe(404);
    expect(isOwnerPath("/api/studio/projects")).toBe(true);
  });
  it("rejects bad input, foreign origins and bad ids", async () => {
    expect((await create(req("POST", body("", {})))).status).toBe(400);
    expect((await create(req("POST", body("x", { type: "video" })))).status).toBe(400);
    expect((await create(req("POST", body("x", { data: "nope" })))).status).toBe(400);
    expect((await create(req("POST", body("x", { thumb: "data:image/svg+xml;base64,AAA" })))).status).toBe(400);
    expect((await create(req("POST", body("x", { data: { big: "a".repeat(MAX_DATA_CHARS) } })))).status).toBe(400);
    const bad = new Request("http://localhost/api/studio/projects", { method: "POST", headers: { "content-type": "application/json", host: "localhost", origin: "https://evil.example" }, body: JSON.stringify(body()) });
    expect((await create(bad)).status).toBe(403);
    expect((await open(req("GET"), ctx("not-a-uuid"))).status).toBe(404);
    expect((await update(req("PUT", { name: "x" }), ctx("00000000-0000-4000-8000-000000000000"))).status).toBe(404);
    const long = (await json(await create(req("POST", body("  a   b  " + "x".repeat(200)))))).project;
    expect(long.name.length).toBeLessThanOrEqual(80); expect(long.name.startsWith("a b x")).toBe(true);
  });
});

describe("restore (saved data is untrusted)", () => {
  it("falls back to defaults for junk and keeps valid fields", () => {
    expect(restoreEnd(null)).toEqual(defaultEndState());
    expect(restoreEnd({ tpl: "evil", size: "huge", align: 5, colors: { bg1: "red" }, custom: { w: 99999, h: "x" } }).custom).toEqual({ w: "4096", h: "1080" });
    const e = restoreEnd({ tpl: "visit", lang: "ar", size: "wide", align: "end", edits: { "visit:ar": { h: "مرحبا" } }, colors: { bg1: "#112233" }, scales: { head: 500 } });
    expect(e).toMatchObject({ tpl: "visit", lang: "ar", size: "wide", align: "end" }); expect(e.colors.bg1).toBe("#112233"); expect(e.scales.head).toBe(200); expect(e.edits["visit:ar"].h).toBe("مرحبا");
    expect(restoreThumb(undefined).spec).toEqual(initialThumbSpec("analysis", "en"));
    const t = restoreThumb({ tpl: "ethereum", spec: { lang: "fr", headline: "Titre", font: "comic", outline: 99, image: "data:image/png;base64,AAAA", headColor: "javascript:x" } });
    expect(t.tpl).toBe("ethereum"); expect(t.spec.headline).toBe("Titre"); expect(t.spec.outline).toBe(12); expect(t.spec.font).toBe("heading"); expect(t.spec.image).toBe("data:image/png;base64,AAAA"); expect(t.spec.headColor).not.toContain("javascript");
    expect(restoreThumb({ spec: { image: "https://evil.example/x.png" } }).spec.image).toBeNull();
    expect(restoreThumb({ spec: { image: "data:image/svg+xml;base64,AAAA" } }).spec.image).toBeNull();
    const p = restorePhone({ template: "radar", format: "square", lang: "ar", phones: [{ screen: "f:radar", size: 120, dx: 5, dy: 0, rot: 3 }, { screen: "evil" }], bg: { kind: "solid", color: "#101010" }, edits: { "radar:ar": { h: "x" } } });
    expect(p).toMatchObject({ template: "radar", format: "square", lang: "ar" }); expect(p.phones).toHaveLength(1);
    expect(restorePhone("junk").phones.length).toBeGreaterThan(0);
  });
  it("round-trips a thumbnail design", () => {
    const spec = { ...initialThumbSpec("bitcoin", "ar"), headline: "عنوان", imgZoom: 150, image: "data:image/jpeg;base64,/9j/AAAA" };
    expect(restoreThumb(JSON.parse(JSON.stringify({ tpl: "bitcoin", spec })))).toEqual({ tpl: "bitcoin", spec });
  });
});

describe("wiring", () => {
  it("all three tools are saveable through the projects panel", () => {
    const page = read("app/share/page.tsx");
    expect(page).toContain("<StudioProjects"); expect(page).toContain("phoneHandle"); expect(page).toContain("restorePhone");
    for (const f of ["components/studio/EndScreenCreator.tsx", "components/studio/YtThumbCreator.tsx"]) { const c = read(f); expect(c).toContain("useImperativeHandle"); expect(c).toContain("restore"); }
    const p = read("components/studio/StudioProjects.tsx");
    for (const s of ["confirmDiscard", "baseline", "unsaved changes", "تغييرات غير محفوظة", "modifications non enregistrées"]) expect(p).toContain(s);
    expect(read("app/share/page.tsx")).toContain("version={opened.key}");
    for (const s of ["My Projects", "مشاريعي", "Mes projets", "/api/studio/projects", "blobToThumb", "shrinkDataUrl", "window.confirm"]) expect(p).toContain(s);
  });
});
