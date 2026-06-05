/**
 * Бенчмарк списков на сервере (без HTTP auth) — только для ops.
 *   cd apps/api && tsx scripts/bench-list-http.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { createDb } from "../src/db/client.js";
import { getAdminDashboardSummary } from "../src/http/admin-dashboard-summary-http.js";
import { listLoadingManifestsForHttp } from "../src/http/loading-manifest-list-http.js";
import { listPurchaseDocumentsForHttp } from "../src/http/purchase-document-list-http.js";
import { DrizzleTripRepository } from "../src/infrastructure/persistence/drizzle-trip.repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL");
  process.exit(1);
}

const { db, sql } = createDb(process.env.DATABASE_URL);
const trips = new DrizzleTripRepository(db);

async function bench(label: string, fn: () => Promise<{ count: number; ms: number; extra?: string }>) {
  const { count, ms, extra } = await fn();
  console.log(`${label.padEnd(28)} ${String(ms).padStart(6)} ms  items=${count}${extra ? `  ${extra}` : ""}`);
}

try {
  const countRow = await sql<{ c: number }>`select count(*)::int as c from loading_manifests`;
  const manifestTotal = countRow[0]?.c ?? 0;
  console.log(`DB: loading_manifests=${manifestTotal}\n`);

  await bench("manifests default limit", async () => {
    const t0 = performance.now();
    const r = await listLoadingManifestsForHttp(db, {});
    return { count: r.loadingManifests.length, ms: Math.round(performance.now() - t0), extra: `total=${r.listMeta.totalCount}` };
  });

  await bench("manifests p50 active", async () => {
    const t0 = performance.now();
    const r = await listLoadingManifestsForHttp(db, { limit: 50, offset: 0, scope: "active" });
    return { count: r.loadingManifests.length, ms: Math.round(performance.now() - t0), extra: `total=${r.listMeta.totalCount}` };
  });

  await bench("trips p50 open", async () => {
    const t0 = performance.now();
    const list = await trips.list({ limit: 50, status: "open" });
    return { count: list.length, ms: Math.round(performance.now() - t0) };
  });

  await bench("trips p25 closed", async () => {
    const t0 = performance.now();
    const list = await trips.list({ limit: 25, status: "closed", offset: 0 });
    return { count: list.length, ms: Math.round(performance.now() - t0) };
  });

  await bench("purchase archived p25", async () => {
    const t0 = performance.now();
    const r = await listPurchaseDocumentsForHttp(db, { limit: 25, offset: 0, scope: "archived" });
    return { count: r.purchaseDocuments.length, ms: Math.round(performance.now() - t0), extra: `total=${r.listMeta.totalCount}` };
  });

  await bench("dashboard summary", async () => {
    const t0 = performance.now();
    const r = await getAdminDashboardSummary(db, {});
    return {
      count: r.loadingManifests.activeCount,
      ms: Math.round(performance.now() - t0),
      extra: `whKg=${r.warehouse.warehouseKg.toFixed(0)}`,
    };
  });
} finally {
  await sql.end({ timeout: 5 });
}
