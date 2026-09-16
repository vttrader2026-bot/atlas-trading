import type { MetadataRoute } from "next";

const BASE = "https://atlastradingapp.vercel.app";
const ROUTES = ["", "/radar", "/analyzer", "/trade-plan", "/journal", "/risk", "/ticker"];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: `${BASE}${route}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: route === "" ? 1 : route === "/analyzer" ? 0.9 : 0.7,
  }));
}
