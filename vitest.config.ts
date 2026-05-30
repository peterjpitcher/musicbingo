import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
    // These suites still use the built-in node:test API (node:test/node:assert)
    // rather than vitest. Excluded until migrated to vitest in a separate change.
    exclude: [
      ...configDefaults.exclude,
      "lib/eventFeed/baronshubAdapter.test.ts",
      "lib/live/reveal.test.ts",
      "lib/live/storage.test.ts",
    ],
  },
  resolve: {
    alias: { "@": root },
  },
});
