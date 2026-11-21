// PROJECTS-v1: list and create Studio projects. Owner only (proxy + requireOwner), private per user id, never cached.
import { NextResponse } from "next/server";
import { noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { getRedis } from "@/lib/redis";
import { createProject, listProjects, parseProjectInput, type ProjectRedis } from "@/lib/studioProjects";

export const dynamic = "force-dynamic";
const err = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const redis = getRedis();
  if (!redis) return err("Server not configured (Redis is missing).", 500);
  try {
    return NextResponse.json({ projects: await listProjects(redis as unknown as ProjectRedis, owner.userId) }, { headers: noStore });
  } catch (e) {
    console.error("studio/projects list failed", e);
    return err("Could not load your projects.", 500);
  }
}

export async function POST(req: Request) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (!body) return err("Invalid request.", 400);
  const input = parseProjectInput(body, false);
  if (!input.ok) return err(input.error, 400);
  const redis = getRedis();
  if (!redis) return err("Server not configured (Redis is missing).", 500);
  try {
    const res = await createProject(redis as unknown as ProjectRedis, owner.userId, crypto.randomUUID(), input.value);
    return res.ok ? NextResponse.json({ project: res.meta }, { status: 201, headers: noStore }) : err(res.error, 409);
  } catch (e) {
    console.error("studio/projects create failed", e);
    return err("Could not save the project. Try again.", 500);
  }
}
