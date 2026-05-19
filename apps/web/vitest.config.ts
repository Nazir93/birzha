import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /** На Windows forks-пул часто падает с OOM / «зависанием»; threads + 1 воркер стабильнее. */
    pool: "threads",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
