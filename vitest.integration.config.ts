import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    threads: false,
    sequence: {
      concurrent: false,
    },
  },
});
