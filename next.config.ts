import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    // Coin Explorer (Phase 2-4) was replaced in Phase 5 by chart panels
    // embedded directly in Radar and Market Intelligence. Anyone who still
    // has an old /coins or /coins/[symbol] link bookmarked/shared lands
    // somewhere useful instead of a 404.
    return [
      { source: "/coins", destination: "/radar", permanent: false },
      { source: "/coins/:symbol", destination: "/radar", permanent: false },
    ];
  },
};

export default nextConfig;
