// PROJECTS-v1: open, update (rename / save changes) and delete one Studio project. Owner only; the id is only ever looked up inside the caller's own hashes.
import { NextResponse } from "next/server";
import { noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { getRedis } from "@/lib/redis";
import { deleteProject, getProject, ID_RE, parseProjectInput, updateProject, type ProjectRedis } from "@/lib/studioProjects";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const err = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });
const missing = () => err("Project not found.", 404);

export async function GET(_req: Request, { params }: Ctx) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  const redis = getRedis();
  if (!ID_RE.test(id)) return missing();
  if (!redis) return err("Server not configured (Redis is missing).", 500);
  try {
    const p = await getProject(redis as unknown as ProjectRedis, owner.userId, id);
    return p ? NextResponse.json({ project: p.meta, data: p.data }, { headers: noStore }) : missing();
  } catch (e) {
    console.error("studio/projects open failed", e);
    return err("Could not open the project.", 500);
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  if (!ID_RE.test(id)) return missing();
  const body = await readBody(req);
  if (!body) return err("Invalid request.", 400);
  const input = parseProjectInput(body, true);
  if (!input.ok) return err(input.error, 400);
  const redis = getRedis();
  if (!redis) return err("Server not configured (Redis is missing).", 500);
  try {
    const meta = await updateProject(redis as unknown as ProjectRedis, owner.userId, id, input.value);
    return meta ? NextResponse.json({ project: meta }, { headers: noStore }) : missing();
  } catch (e) {
    console.error("studio/projects update failed", e);
    return err("Could not save the project. Try again.", 500);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  if (!ID_RE.test(id)) return missing();
  const redis = getRedis();
  if (!redis) return err("Server not configured (Redis is missing).", 500);
  try {
    return (await deleteProject(redis as unknown as ProjectRedis, owner.userId, id)) ? NextResponse.json({ ok: true }, { headers: noStore }) : missing();
  } catch (e) {
    console.error("studio/projects delete failed", e);
    return err("Could not delete the project.", 500);
  }
}
