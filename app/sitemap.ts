import type { MetadataRoute } from "next";
import { getVideos, videoPagePath } from "@/lib/videos";

const BASE = "https://www.atlastrading.app";
const ROUTES = ["", "/workflow", "/radar", "/analyzer", "/trade-plan", "/journal", "/risk", "/ticker", "/videos"];

export default function sitemap(): MetadataRoute.Sitemap {
  // VIDEOS-v1: every video in lib/videos.ts gets its own sitemap entry.
  const routes = [...ROUTES, ...getVideos().map((v) => videoPagePath(v.id))];
  return routes.map((route) => ({
    url: `${BASE}${route}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: route === "" ? 1 : route === "/analyzer" ? 0.9 : 0.7,
  }));
}
