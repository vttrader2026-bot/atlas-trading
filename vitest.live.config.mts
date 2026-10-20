import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Live-network verification suite — run manually with `npm run test:live`.
// This makes real requests to Binance's public data API and is kept
// separate from `npm test` so routine CI/dev runs never depend on network
// access or Binance's uptime. See lib/__tests__/marketData.live.test.ts.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["lib/__tests__/**/*.live.test.ts"],
    testTimeout: 20_000,
  },
});
