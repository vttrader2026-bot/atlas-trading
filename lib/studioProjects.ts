// PROJECTS-v1: saved designs ("My Projects") of the Social Media Studio. Pure validation + Redis helpers, shared by the API routes.
// Per signed-in owner: studio:projects:<userId> (hash id -> light record with the preview) and studio:project-data:<userId> (hash id -> the
// full design data). The list only reads the light hash, so opening the page never pulls every design's data.
export type ProjectType = "phone" | "end" | "thumb";
export const PROJECT_TYPES: ProjectType[] = ["phone", "end", "thumb"];
export const MAX_PROJECTS = 100;
export const MAX_NAME = 80;
export const MAX_DATA_CHARS = 900_000; // stays under the Redis REST request limit
export const MAX_THUMB_CHARS = 60_000;
export const THUMB_PREFIX = "data:image/jpeg;base64,";
export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ProjectMeta = { id: string; type: ProjectType; name: string; thumb: string; createdAt: number; updatedAt: number };
export type ProjectRedis = {
  hgetall: <T = unknown>(key: string) => Promise<Record<string, T> | null>;
  hget: <T = unknown>(key: string, field: string) => Promise<T | null>;
  hset: (key: string, values: Record<string, unknown>) => Promise<unknown>;
  hdel: (key: string, ...fields: string[]) => Promise<unknown>;
};
export const metaKey = (userId: string) => `studio:projects:${userId}`;
export const dataKey = (userId: string) => `studio:project-data:${userId}`;

export const cleanName = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "");
export const isProjectType = (v: unknown): v is ProjectType => typeof v === "string" && (PROJECT_TYPES as string[]).includes(v);

export type ProjectInput = { type?: ProjectType; name?: string; thumb?: string; data?: Record<string, unknown> };
/** Validates a create (`partial` false: type, name and data required) or update (`partial` true: any of name, thumb, data) body. */
export function parseProjectInput(body: Record<string, unknown>, partial: boolean): { ok: true; value: ProjectInput } | { ok: false; error: string } {
  const out: ProjectInput = {};
  if (!partial || body.type !== undefined) {
    if (!isProjectType(body.type)) return { ok: false, error: "Unknown design type." };
    out.type = body.type;
  }
  if (!partial || body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return { ok: false, error: "Enter a name." };
    out.name = name;
  }
  if (body.thumb !== undefined) {
    if (typeof body.thumb !== "string" || (body.thumb !== "" && !body.thumb.startsWith(THUMB_PREFIX)) || body.thumb.length > MAX_THUMB_CHARS) return { ok: false, error: "Invalid preview image." };
    out.thumb = body.thumb;
  }
  if (!partial || body.data !== undefined) {
    const d = body.data;
    if (!d || typeof d !== "object" || Array.isArray(d)) return { ok: false, error: "Missing design data." };
    if (JSON.stringify(d).length > MAX_DATA_CHARS) return { ok: false, error: "This design is too large to save. Use a smaller background image." };
    out.data = d as Record<string, unknown>;
  }
  return { ok: true, value: out };
}

const isMeta = (m: unknown): m is ProjectMeta => !!m && typeof m === "object" && typeof (m as ProjectMeta).id === "string" && isProjectType((m as ProjectMeta).type);

export async function listProjects(redis: ProjectRedis, userId: string): Promise<ProjectMeta[]> {
  const all = (await redis.hgetall<unknown>(metaKey(userId))) ?? {};
  return Object.values(all).filter(isMeta).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function getProject(redis: ProjectRedis, userId: string, id: string): Promise<{ meta: ProjectMeta; data: Record<string, unknown> } | null> {
  const meta = await redis.hget<unknown>(metaKey(userId), id);
  const data = await redis.hget<unknown>(dataKey(userId), id);
  return isMeta(meta) && data && typeof data === "object" ? { meta, data: data as Record<string, unknown> } : null;
}
export async function createProject(redis: ProjectRedis, userId: string, id: string, input: ProjectInput, now = Date.now()): Promise<{ ok: true; meta: ProjectMeta } | { ok: false; error: string }> {
  if ((await listProjects(redis, userId)).length >= MAX_PROJECTS) return { ok: false, error: `You can keep up to ${MAX_PROJECTS} projects. Delete one first.` };
  const meta: ProjectMeta = { id, type: input.type as ProjectType, name: input.name as string, thumb: input.thumb ?? "", createdAt: now, updatedAt: now };
  await redis.hset(dataKey(userId), { [id]: input.data });
  await redis.hset(metaKey(userId), { [id]: meta }); // the list entry appears only after the data is stored
  return { ok: true, meta };
}
export async function updateProject(redis: ProjectRedis, userId: string, id: string, input: ProjectInput, now = Date.now()): Promise<ProjectMeta | null> {
  const cur = await redis.hget<unknown>(metaKey(userId), id);
  if (!isMeta(cur)) return null;
  if (input.data) await redis.hset(dataKey(userId), { [id]: input.data });
  const meta: ProjectMeta = { ...cur, name: input.name ?? cur.name, thumb: input.thumb ?? cur.thumb, updatedAt: now };
  await redis.hset(metaKey(userId), { [id]: meta });
  return meta;
}
export async function deleteProject(redis: ProjectRedis, userId: string, id: string): Promise<boolean> {
  const cur = await redis.hget<unknown>(metaKey(userId), id);
  if (!isMeta(cur)) return false;
  await redis.hdel(metaKey(userId), id);
  await redis.hdel(dataKey(userId), id);
  return true;
}
