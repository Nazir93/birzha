/**
 * Лёгкий smoke нагрузки: параллельные GET к API без внешних зависимостей (без k6).
 *
 * Переменные окружения:
 *   BASE_URL    — базовый URL (по умолчанию http://127.0.0.1:3000)
 *   LOAD_PATH   — путь (по умолчанию /health)
 *   TOTAL       — число запросов (по умолчанию 500)
 *   CONCURRENCY — одновременных «воркеров» (по умолчанию 50)
 *   MAX_P95_MS  — порог p95 latency (если задано — скрипт падает при превышении)
 *   MIN_RPS     — минимальный RPS (если задано — скрипт падает при просадке)
 *
 * Запуск: поднять API (`pnpm dev:api`), затем из корня репозитория:
 *   pnpm load:smoke
 */

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const LOAD_PATH = process.env.LOAD_PATH ?? "/health";
const TOTAL = Math.max(1, Number(process.env.TOTAL ?? 500));
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? 50));
const MAX_P95_MS = process.env.MAX_P95_MS ? Number(process.env.MAX_P95_MS) : null;
const MIN_RPS = process.env.MIN_RPS ? Number(process.env.MIN_RPS) : null;

const url = new URL(LOAD_PATH, BASE_URL.replace(/\/?$/, "/")).href;

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runLimited(total, concurrency, fn) {
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    for (;;) {
      const i = next++;
      if (i >= total) break;
      await fn(i);
    }
  });
  await Promise.all(workers);
}

const latencies = [];
let ok = 0;
let fail = 0;

const t0 = performance.now();

await runLimited(TOTAL, CONCURRENCY, async () => {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
    });
    latencies.push(performance.now() - start);
    if (res.ok) ok += 1;
    else fail += 1;
  } catch {
    fail += 1;
  }
});

const elapsedMs = performance.now() - t0;
latencies.sort((a, b) => a - b);
const p95 = Math.round(percentile(latencies, 95));
const rps = Math.round((ok / elapsedMs) * 1000);

console.log(JSON.stringify({
  url,
  total: TOTAL,
  concurrency: CONCURRENCY,
  ok,
  fail,
  elapsedMs: Math.round(elapsedMs),
  rps,
  latencyMs: {
    p50: Math.round(percentile(latencies, 50)),
    p95,
    max: Math.round(latencies[latencies.length - 1] ?? 0),
  },
}, null, 2));

let gateFailed = fail > 0;
if (MAX_P95_MS != null && Number.isFinite(MAX_P95_MS) && p95 > MAX_P95_MS) {
  console.error(`load-smoke gate failed: p95 ${p95}ms > MAX_P95_MS ${MAX_P95_MS}ms`);
  gateFailed = true;
}
if (MIN_RPS != null && Number.isFinite(MIN_RPS) && rps < MIN_RPS) {
  console.error(`load-smoke gate failed: rps ${rps} < MIN_RPS ${MIN_RPS}`);
  gateFailed = true;
}
if (gateFailed) {
  process.exitCode = 1;
}
