import type { MetadataRoute } from "next";
import { videoPagePath } from "@/lib/videos";
import { loadPublished } from "@/lib/videoStore";

const BASE = "https://www.atlastrading.app";
const ROUTES = ["", "/workflow", "/radar", "/analyzer", "/trade-plan", "/journal", "/risk", "/ticker", "/videos"];

// Read from Redis on each request: only PUBLISHED videos are listed, drafts never are.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = [...ROUTES, ...(await loadPublished()).map((v) => videoPagePath(v.id))];
  return routes.map((route) => ({
    url: `${BASE}${route}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: route === "" ? 1 : route === "/analyzer" ? 0.9 : 0.7,
  }));
}
