import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",
    /** Параллельные файлы + первый `buildApp` (Helmet, rate-limit, импорты) на CI/Windows часто > 5s. */
    testTimeout: 20_000,
    hookTimeout: 20_000,
    /** На Windows forks-пул часто падает с OOM / «зависанием»; threads + 1 воркер стабильнее (как в web). */
    pool: "threads",
    maxWorkers: 1,
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
  },
});
