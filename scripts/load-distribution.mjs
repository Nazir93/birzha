/**
 * Нагрузочная проверка раздела «Распределение»: списки погрузочных, рейсов, партий.
 *
 * Перед запуском:
 *   cd apps/api && pnpm db:reset-test-data && pnpm db:seed-load-test
 *   pnpm dev:api
 *
 * Из корня:
 *   pnpm load:distribution
 *
 * Переменные:
 *   BASE_URL       — http://127.0.0.1:3000
 *   LOGIN/PASSWORD — если REQUIRE_API_AUTH=true
 *   TOTAL          — запросов на каждый путь (по умолчанию 30)
 *   CONCURRENCY    — параллельных воркеров (по умолчанию 10)
 *   PATHS          — через запятую; по умолчанию набор distribution
 *   MAX_P95_MS     — порог p95 latency на каждый путь
 *   MAX_FAIL       — допустимое число ошибок (по умолчанию 0)
 */

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const TOTAL = Math.max(1, Number(process.env.TOTAL ?? 30));
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? 10));
const MAX_P95_MS = process.env.MAX_P95_MS ? Number(process.env.MAX_P95_MS) : null;
const MAX_FAIL = Math.max(0, Number(process.env.MAX_FAIL ?? 0));
const LOGIN = process.env.LOGIN ?? process.env.BIRZHA_LOAD_LOGIN ?? "";
const PASSWORD = process.env.PASSWORD ?? process.env.BIRZHA_LOAD_PASSWORD ?? "";

const DEFAULT_PATHS = [
  "/loading-manifests",
  "/trips",
  "/batches",
  "/loading-manifests/reserved-batch-ids?warehouseId=wh-manas",
  "/loading-manifests/reserved-batch-ids?warehouseId=wh-kayakent",
  "/warehouses",
];

const PATHS = (process.env.PATHS ?? DEFAULT_PATHS.join(","))
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

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

function resolveUrl(path) {
  return new URL(path, BASE_URL.replace(/\/?$/, "/")).href;
}

async function loginIfNeeded() {
  if (!LOGIN || !PASSWORD) {
    return {};
  }
  const res = await fetch(resolveUrl("/auth/login"), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`login failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  const headers = { accept: "application/json" };
  if (body.token) {
    headers.authorization = `Bearer ${body.token}`;
  }
  const cookie = res.headers.get("set-cookie");
  if (cookie) {
    headers.cookie = cookie.split(";")[0];
  }
  return headers;
}

async function probePath(path, authHeaders) {
  const url = resolveUrl(path);
  const start = performance.now();
  const res = await fetch(url, { headers: authHeaders });
  const bodyText = await res.text();
  const elapsedMs = performance.now() - start;
  let itemCount = null;
  if (res.ok) {
    try {
      const json = JSON.parse(bodyText);
      if (Array.isArray(json.loadingManifests)) itemCount = json.loadingManifests.length;
      else if (Array.isArray(json.trips)) itemCount = json.trips.length;
      else if (Array.isArray(json.batches)) itemCount = json.batches.length;
      else if (Array.isArray(json.batchIds)) itemCount = json.batchIds.length;
      else if (Array.isArray(json.warehouses)) itemCount = json.warehouses.length;
    } catch {
      // ignore parse errors for smoke
    }
  }
  return {
    ok: res.ok,
    status: res.status,
    elapsedMs,
    bytes: bodyText.length,
    itemCount,
  };
}

const authHeaders = await loginIfNeeded();
const report = {
  baseUrl: BASE_URL,
  totalPerPath: TOTAL,
  concurrency: CONCURRENCY,
  paths: [],
  fail: 0,
  gateFailed: false,
};

for (const path of PATHS) {
  const latencies = [];
  let ok = 0;
  let fail = 0;
  let bytes = 0;
  let itemCount = null;

  const t0 = performance.now();
  await runLimited(TOTAL, CONCURRENCY, async (i) => {
    try {
      const r = await probePath(path, authHeaders);
      latencies.push(r.elapsedMs);
      bytes = Math.max(bytes, r.bytes);
      if (r.itemCount != null) itemCount = r.itemCount;
      if (r.ok) ok += 1;
      else fail += 1;
    } catch {
      fail += 1;
    }
    if (i === 0 && fail > 0 && path === PATHS[0]) {
      // first request failed — likely API down
    }
  });
  const elapsedMs = performance.now() - t0;
  latencies.sort((a, b) => a - b);

  const entry = {
    path,
    ok,
    fail,
    elapsedMs: Math.round(elapsedMs),
    rps: ok > 0 ? Math.round((ok / elapsedMs) * 1000) : 0,
    responseBytesMax: bytes,
    itemCount,
    latencyMs: {
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      max: Math.round(latencies[latencies.length - 1] ?? 0),
    },
  };
  report.paths.push(entry);
  report.fail += fail;
  if (MAX_P95_MS != null && Number.isFinite(MAX_P95_MS) && entry.latencyMs.p95 > MAX_P95_MS) {
    report.gateFailed = true;
  }
}

console.log(JSON.stringify(report, null, 2));

if (report.fail > MAX_FAIL || report.gateFailed) {
  if (report.fail > MAX_FAIL) {
    console.error(`load-distribution gate failed: fail=${report.fail} > MAX_FAIL=${MAX_FAIL}`);
  }
  if (report.gateFailed && MAX_P95_MS != null) {
    console.error(`load-distribution gate failed: p95 on at least one path > MAX_P95_MS=${MAX_P95_MS}`);
  }
  process.exitCode = 1;
}
