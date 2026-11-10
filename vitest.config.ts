import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts", "app/**/*.test.ts"],
    exclude: [...configDefaults.exclude],
  },
  resolve: {
    alias: {
      "@": root,
      // `server-only` throws outside Next's server bundle; tests run in Node.
      "server-only": path.join(root, "lib/test/server-only-stub.ts"),
    },
  },
});
