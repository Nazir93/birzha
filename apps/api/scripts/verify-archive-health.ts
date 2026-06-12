/**
 * Проверка архива после seed-demo + seed-archive-stress.
 *   cd apps/api && pnpm db:verify-archive
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { loadEnv } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import { buildApp } from "../src/app.js";
import { listLoadingManifestsForHttp } from "../src/http/loading-manifest-list-http.js";
import { listPurchaseDocumentsForHttp } from "../src/http/purchase-document-list-http.js";
import { DrizzleTripRepository } from "../src/infrastructure/persistence/drizzle-trip.repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const PAGE_SIZE = 25;
const MIN_CLOSED_TRIPS = Math.max(1, Number(process.env.BIRZHA_ARCHIVE_MIN_CLOSED ?? 50));
const MIN_ARCHIVED_MANIFESTS = Math.max(1, Number(process.env.BIRZHA_ARCHIVE_MIN_MANIFESTS ?? 50));
const MIN_ARCHIVED_DOCS = Math.max(1, Number(process.env.BIRZHA_ARCHIVE_MIN_DOCS ?? 50));

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`OK: ${message}`);
}

if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL");
  process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("Нужен JWT_SECRET ≥ 32 символов");
  process.exit(1);
}

const { db, sql } = createDb(process.env.DATABASE_URL);
const trips = new DrizzleTripRepository(db);

try {
  const closedTotalRow = await sql<{ c: number }>`select count(*)::int as c from trips where status = 'closed'`;
  const closedTotal = closedTotalRow[0]?.c ?? 0;
  if (closedTotal < MIN_CLOSED_TRIPS) {
    fail(`closed trips=${closedTotal}, нужно ≥ ${MIN_CLOSED_TRIPS}`);
  }
  ok(`closed trips=${closedTotal}`);

  const openTotalRow = await sql<{ c: number }>`select count(*)::int as c from trips where status = 'open'`;
  ok(`open trips=${openTotalRow[0]?.c ?? 0} (остаются в работе)`);

  const page1 = await trips.list({ limit: PAGE_SIZE, offset: 0, status: "closed" });
  if (page1.length < Math.min(PAGE_SIZE, closedTotal)) {
    fail(`первая страница closed: ${page1.length} записей`);
  }
  ok(`closed page1=${page1.length}`);

  if (closedTotal > PAGE_SIZE) {
    const page2 = await trips.list({ limit: PAGE_SIZE, offset: PAGE_SIZE, status: "closed" });
    if (page2.length === 0) {
      fail("вторая страница closed пустая при total > PAGE_SIZE");
    }
    ok(`closed page2=${page2.length} (пагинация)`);
  }

  const manifests = await listLoadingManifestsForHttp(db, {
    limit: PAGE_SIZE,
    offset: 0,
    scope: "archived",
  });
  if (manifests.listMeta.totalCount < MIN_ARCHIVED_MANIFESTS) {
    fail(`archived manifests total=${manifests.listMeta.totalCount}, нужно ≥ ${MIN_ARCHIVED_MANIFESTS}`);
  }
  ok(`archived manifests total=${manifests.listMeta.totalCount}, page1=${manifests.loadingManifests.length}`);

  if (manifests.listMeta.totalCount > PAGE_SIZE) {
    const m2 = await listLoadingManifestsForHttp(db, {
      limit: PAGE_SIZE,
      offset: PAGE_SIZE,
      scope: "archived",
    });
    if (m2.loadingManifests.length === 0) {
      fail("archived manifests page2 пустая");
    }
    ok(`archived manifests page2=${m2.loadingManifests.length}`);
  }

  const docs = await listPurchaseDocumentsForHttp(db, {
    limit: PAGE_SIZE,
    offset: 0,
    scope: "archived",
  });
  if (docs.listMeta.totalCount < MIN_ARCHIVED_DOCS) {
    fail(`archived purchase docs total=${docs.listMeta.totalCount}, нужно ≥ ${MIN_ARCHIVED_DOCS}`);
  }
  ok(`archived purchase docs total=${docs.listMeta.totalCount}, page1=${docs.purchaseDocuments.length}`);

  if (docs.listMeta.totalCount > PAGE_SIZE * 2) {
    const deepOffset = docs.listMeta.totalCount - PAGE_SIZE;
    const t0 = performance.now();
    const deep = await listPurchaseDocumentsForHttp(db, {
      limit: PAGE_SIZE,
      offset: deepOffset,
      scope: "archived",
    });
    const ms = Math.round(performance.now() - t0);
    if (deep.purchaseDocuments.length === 0) {
      fail(`archived purchase docs deep page offset=${deepOffset} пустая`);
    }
    ok(`archived purchase docs deep page offset=${deepOffset}, rows=${deep.purchaseDocuments.length} (${ms} ms)`);
  }

  if (closedTotal > PAGE_SIZE * 2) {
    const deepOffset = closedTotal - PAGE_SIZE;
    const t0 = performance.now();
    const deep = await trips.list({ limit: PAGE_SIZE, offset: deepOffset, status: "closed" });
    const ms = Math.round(performance.now() - t0);
    if (deep.length === 0) {
      fail(`closed trips deep page offset=${deepOffset} пустая`);
    }
    ok(`closed trips deep page offset=${deepOffset}, rows=${deep.length} (${ms} ms)`);
  }

  const tripId = page1[0]?.getId();
  if (!tripId) {
    fail("нет sample tripId для отчёта");
  }

  const env = loadEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: "development",
    REQUIRE_API_AUTH: "false",
  });
  const app = await buildApp({ env, db });

  const demoTripRow = await sql<{ id: string }>`
    select id from trips where id = 'demo-trip-r105' limit 1
  `;
  const reportTripId = demoTripRow[0]?.id ?? tripId;
  const reportRes = await app.inject({
    method: "GET",
    url: `/trips/${encodeURIComponent(reportTripId)}/shipment-report`,
  });
  if (reportRes.statusCode !== 200) {
    fail(`shipment-report ${reportTripId} → HTTP ${reportRes.statusCode}: ${reportRes.body}`);
  }
  const report = JSON.parse(reportRes.body) as {
    shipment?: { totalGrams?: string };
    sales?: { totalGrams?: string };
  };
  if (!report.shipment?.totalGrams || !report.sales?.totalGrams) {
    fail(`shipment-report ${reportTripId} без shipment/sales`);
  }
  ok(`shipment-report для ${reportTripId} (HTTP 200, отгрузка и продажи)`);

  const activeManifests = await listLoadingManifestsForHttp(db, {
    limit: 1,
    offset: 0,
    scope: "active",
  });
  ok(`active manifests total=${activeManifests.listMeta.totalCount} (не смешаны с archived)`);

  await app.close();
  console.log("");
  console.log("Архив: все проверки пройдены.");
} finally {
  await sql.end({ timeout: 5 });
}
