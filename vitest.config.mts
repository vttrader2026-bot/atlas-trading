import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Default config: fast, mocked unit tests only (`npm test`). The live
// Binance verification suite is deliberately excluded here — see
// vitest.live.config.ts and lib/__tests__/marketData.live.test.ts.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["lib/__tests__/**/*.test.ts"],
    exclude: ["lib/__tests__/**/*.live.test.ts", "node_modules/**"],
    // Defensive headroom above Vitest's 5000ms default: a cold module
    // import (e.g. first-time transform of a large dependency) can edge
    // past 5s on a slower machine even though no test here ever touches
    // the network. 15s gives real margin without masking a genuine hang.
    testTimeout: 15000,
  },
});
