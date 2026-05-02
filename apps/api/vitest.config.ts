import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    /** Параллельные файлы + первый `buildApp` (Helmet, rate-limit, импорты) на CI/Windows часто > 5s. */
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: ["src/**/*.test.ts"],
  },
});
