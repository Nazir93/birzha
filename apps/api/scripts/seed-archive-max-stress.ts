/**
 * Максимальная нагрузка архива: закупочные + закрытые рейсы + погрузочные (bulk SQL).
 *
 *   cd apps/api
 *   pnpm db:seed-archive-max-stress
 *
 * По умолчанию: 100 000 закупочных, 50 000 closed trips, 50 000 погрузочных на closed.
 * Перед вставкой удаляет прежние ARCHIVE-BULK-* и ARCHIVE-trip-* / ARCHIVE-lm-* / ARCHIVE-pd-*.
 *
 * Переменные:
 * - BIRZHA_ARCHIVE_NKL_COUNT (100000)
 * - BIRZHA_ARCHIVE_TRIP_COUNT (50000)
 * - BIRZHA_ARCHIVE_MANIFEST_COUNT (по умолчанию = TRIP_COUNT)
 * - BIRZHA_ARCHIVE_CHUNK (1000)
 * - BIRZHA_ARCHIVE_SKIP_CLEANUP=1 — не удалять старые ARCHIVE-* bulk данные
 * - BIRZHA_ARCHIVE_CLEANUP_BATCH — размер порции DELETE (по умолчанию 10000)
 *
 * Если «зависло» на очистке: остановите API (`sudo systemctl stop birzha-api`) и запустите снова.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { createDb } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import { listLoadingManifestsForHttp } from "../src/http/loading-manifest-list-http.js";
import { listPurchaseDocumentsForHttp } from "../src/http/purchase-document-list-http.js";
import { DrizzleTripRepository } from "../src/infrastructure/persistence/drizzle-trip.repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const PREFIX = "ARCHIVE-BULK-";
const NKL_COUNT = Math.max(1, Number(process.env.BIRZHA_ARCHIVE_NKL_COUNT ?? 100_000));
const TRIP_COUNT = Math.max(1, Number(process.env.BIRZHA_ARCHIVE_TRIP_COUNT ?? 50_000));
const MANIFEST_COUNT = Math.max(
  0,
  Number(process.env.BIRZHA_ARCHIVE_MANIFEST_COUNT ?? TRIP_COUNT),
);
const CHUNK_SIZE = Math.max(100, Number(process.env.BIRZHA_ARCHIVE_CHUNK ?? 1000));
const CLEANUP_BATCH = Math.max(1000, Number(process.env.BIRZHA_ARCHIVE_CLEANUP_BATCH ?? 10_000));
const SKIP_CLEANUP = process.env.BIRZHA_ARCHIVE_SKIP_CLEANUP === "1";

const WAREHOUSES = ["wh-manas", "wh-kayakent"] as const;
const DESTINATIONS = ["moscow", "regions"] as const;
const GRADE_ID = "pg-n5";
const BATCH_GRAMS = 100_000n;
const BATCH_PACKAGES = 20n;
const PRICE_PER_KG = "48.000000";
const LINE_KOPECKS = 480_000n;

function warehouseForIndex(i: number): (typeof WAREHOUSES)[number] {
  return WAREHOUSES[i % WAREHOUSES.length]!;
}

function destinationForIndex(i: number): (typeof DESTINATIONS)[number] {
  return DESTINATIONS[i % DESTINATIONS.length]!;
}

function docDateForIndex(i: number): string {
  const year = 2018 + (i % 8);
  const month = (i % 12) + 1;
  const day = (i % 28) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function departedAtForIndex(i: number): Date {
  return new Date(`${docDateForIndex(i)}T${String((i % 9) + 8).padStart(2, "0")}:00:00.000Z`);
}

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLockTimeoutError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "55P03"
  );
}

async function warnIfApiRunning(): Promise<boolean> {
  try {
    const res = await fetch("http://127.0.0.1:3000/health", { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      console.error("");
      console.error("ВНИМАНИЕ: birzha-api отвечает на :3000 — очистка может ждать блокировки минутами.");
      console.error("  Лучше остановить API (нужен sudo у admin): sudo systemctl stop birzha-api");
      console.error("  Если данные уже загружены — не перезапускайте сид, только verify-archive.");
      console.error("  Пропуск очистки и вставки: BIRZHA_ARCHIVE_SKIP_CLEANUP=1 (если ARCHIVE-BULK уже есть — exit 2).");
      console.error("");
      return true;
    }
  } catch {
    /* API не слушает — хорошо для cleanup */
  }
  return false;
}

async function runDeleteWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (isLockTimeoutError(error) && attempt < maxAttempts) {
        console.log(`  ${label}: блокировка БД, пауза 15s (попытка ${attempt}/${maxAttempts})…`);
        await sleep(15_000);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`${label}: не удалось после ${maxAttempts} попыток`);
}

function deleteCount(result: unknown): number {
  if (result && typeof result === "object" && "count" in result) {
    const c = (result as { count: number | null }).count;
    return c ?? 0;
  }
  return 0;
}

/** Порционное удаление с логом — не выглядит как «зависло». */
async function deleteBatched(
  sql: ReturnType<typeof createDb>["sql"],
  label: string,
  table: string,
  whereSql: string,
): Promise<number> {
  let total = 0;
  let pass = 0;
  while (true) {
    pass += 1;
    const tPass = performance.now();
    const result = await runDeleteWithRetry(label, () =>
      sql.unsafe(`
      WITH picked AS (
        SELECT ctid FROM ${table}
        WHERE ${whereSql}
        LIMIT ${CLEANUP_BATCH}
      )
      DELETE FROM ${table} AS t
      USING picked AS p
      WHERE t.ctid = p.ctid
    `),
    );
    const n = deleteCount(result);
    total += n;
    if (n === 0) {
      if (pass === 1) {
        console.log(`  ${label}: 0 строк`);
      } else {
        console.log(`  ${label}: всего ${total} строк (${pass - 1} порций)`);
      }
      break;
    }
    console.log(`  ${label}: −${n} (всего ${total}, ${elapsedMs(tPass)} ms)`);
  }
  return total;
}

async function deleteOnce(
  sql: ReturnType<typeof createDb>["sql"],
  label: string,
  table: string,
  whereSql: string,
): Promise<number> {
  const tPass = performance.now();
  const result = await runDeleteWithRetry(label, () =>
    sql.unsafe(`DELETE FROM ${table} WHERE ${whereSql}`),
  );
  const n = deleteCount(result);
  console.log(`  ${label}: ${n} строк (${elapsedMs(tPass)} ms)`);
  return n;
}

async function cleanupArchiveBulk(sql: ReturnType<typeof createDb>["sql"]): Promise<void> {
  console.log("Очистка прежних ARCHIVE-BULK-* и ARCHIVE-trip/lm/pd-* …");
  console.log(`  порция DELETE=${CLEANUP_BATCH}`);
  await warnIfApiRunning();
  const t0 = performance.now();

  // Ждём блокировку сколько нужно; statement_timeout — не более 30 мин на сессию.
  await sql.unsafe(`SET lock_timeout = '0'`);
  await sql.unsafe(`SET statement_timeout = '1800000'`);

  await deleteOnce(
    sql,
    "trip_batch_sales",
    "trip_batch_sales",
    "trip_id LIKE 'ARCHIVE-BULK-trip-%' OR trip_id LIKE 'ARCHIVE-trip-%'",
  );
  await deleteOnce(
    sql,
    "trip_batch_shortages",
    "trip_batch_shortages",
    "trip_id LIKE 'ARCHIVE-BULK-trip-%' OR trip_id LIKE 'ARCHIVE-trip-%'",
  );
  await deleteOnce(
    sql,
    "trip_batch_shipments",
    "trip_batch_shipments",
    "trip_id LIKE 'ARCHIVE-BULK-trip-%' OR trip_id LIKE 'ARCHIVE-trip-%'",
  );

  await deleteBatched(
    sql,
    "loading_manifest_lines",
    "loading_manifest_lines",
    "manifest_id LIKE 'ARCHIVE-BULK-lm-%' OR manifest_id LIKE 'ARCHIVE-lm-%'",
  );
  await deleteBatched(
    sql,
    "loading_manifests",
    "loading_manifests",
    "id LIKE 'ARCHIVE-BULK-lm-%' OR id LIKE 'ARCHIVE-lm-%'",
  );
  await deleteBatched(
    sql,
    "trips (ARCHIVE)",
    "trips",
    "id LIKE 'ARCHIVE-BULK-trip-%' OR id LIKE 'ARCHIVE-trip-%'",
  );
  await deleteBatched(
    sql,
    "purchase_document_lines",
    "purchase_document_lines",
    "document_id LIKE 'ARCHIVE-BULK-pd-%' OR document_id LIKE 'ARCHIVE-pd-%'",
  );
  await deleteBatched(
    sql,
    "batches",
    "batches",
    "id LIKE 'ARCHIVE-BULK-batch-%' OR purchase_id LIKE 'ARCHIVE-BULK-pd-%' OR purchase_id LIKE 'ARCHIVE-pd-%'",
  );
  await deleteBatched(
    sql,
    "purchase_documents",
    "purchase_documents",
    "id LIKE 'ARCHIVE-BULK-pd-%' OR id LIKE 'ARCHIVE-pd-%'",
  );

  console.log(`  очистка завершена: ${elapsedMs(t0)} ms`);
}

async function seedArchivedPurchaseDocuments(
  db: ReturnType<typeof createDb>["db"],
  count: number,
): Promise<number> {
  console.log(`Закупочные в архив: ${count} …`);
  const t0 = performance.now();
  for (let start = 0; start < count; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, count);
    const docs: (typeof schema.purchaseDocuments.$inferInsert)[] = [];
    const lines: (typeof schema.purchaseDocumentLines.$inferInsert)[] = [];
    const batches: (typeof schema.batches.$inferInsert)[] = [];

    for (let j = start; j < end; j += 1) {
      const docId = `${PREFIX}pd-${j}`;
      const batchId = `${PREFIX}batch-${j}`;
      const warehouseId = warehouseForIndex(j);

      docs.push({
        id: docId,
        documentNumber: `${PREFIX}NKL-${String(j + 1).padStart(7, "0")}`,
        docDate: new Date(`${docDateForIndex(j)}T00:00:00.000Z`),
        warehouseId,
        supplierName: `${PREFIX}Поставщик`,
      });
      batches.push({
        id: batchId,
        purchaseId: docId,
        totalGrams: BATCH_GRAMS,
        pendingInboundGrams: 0n,
        onWarehouseGrams: 0n,
        inTransitGrams: 0n,
        soldGrams: BATCH_GRAMS,
        writtenOffGrams: 0n,
        pricePerKg: PRICE_PER_KG,
        warehouseId,
        destination: destinationForIndex(j),
      });
      lines.push({
        id: `${PREFIX}pdl-${j}`,
        documentId: docId,
        lineNo: 1,
        productGradeId: GRADE_ID,
        quantityGrams: BATCH_GRAMS,
        packageCount: BATCH_PACKAGES,
        pricePerKg: PRICE_PER_KG,
        lineTotalKopecks: LINE_KOPECKS,
        batchId,
      });
    }

    await db.insert(schema.purchaseDocuments).values(docs);
    await db.insert(schema.batches).values(batches);
    await db.insert(schema.purchaseDocumentLines).values(lines);

    if (end % 10_000 === 0 || end === count) {
      console.log(`  накладные … ${end} / ${count} (${elapsedMs(t0)} ms)`);
    }
  }
  return elapsedMs(t0);
}

async function seedClosedTrips(db: ReturnType<typeof createDb>["db"], count: number): Promise<number> {
  console.log(`Закрытые рейсы: ${count} …`);
  const t0 = performance.now();
  for (let start = 0; start < count; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, count);
    const rows: (typeof schema.trips.$inferInsert)[] = [];
    for (let j = start; j < end; j += 1) {
      rows.push({
        id: `${PREFIX}trip-${j}`,
        tripNumber: `${PREFIX}Р-${String(j + 1).padStart(6, "0")}`,
        status: "closed",
        vehicleLabel: `Архив ${j + 1}`,
        driverName: "Max-stress",
        departedAt: departedAtForIndex(j),
      });
    }
    await db.insert(schema.trips).values(rows);
    if (end % 10_000 === 0 || end === count) {
      console.log(`  рейсы … ${end} / ${count} (${elapsedMs(t0)} ms)`);
    }
  }
  return elapsedMs(t0);
}

async function seedArchivedManifests(
  db: ReturnType<typeof createDb>["db"],
  count: number,
  batchCount: number,
): Promise<number> {
  if (count === 0) {
    return 0;
  }
  console.log(`Погрузочные на closed: ${count} …`);
  const t0 = performance.now();
  for (let start = 0; start < count; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, count);
    const manifests: (typeof schema.loadingManifests.$inferInsert)[] = [];
    const lines: (typeof schema.loadingManifestLines.$inferInsert)[] = [];

    for (let j = start; j < end; j += 1) {
      const manifestId = `${PREFIX}lm-${j}`;
      const tripId = `${PREFIX}trip-${j}`;
      const batchId = `${PREFIX}batch-${j % batchCount}`;
      const warehouseId = warehouseForIndex(j);
      const destinationCode = destinationForIndex(j);

      manifests.push({
        id: manifestId,
        manifestNumber: `${PREFIX}ПН-${String(j + 1).padStart(6, "0")}`,
        docDate: new Date(`${docDateForIndex(j)}T00:00:00.000Z`),
        warehouseId,
        destinationCode,
        tripId,
      });
      lines.push({
        manifestId,
        batchId,
        lineNo: 1,
        grams: BATCH_GRAMS,
        packageCount: BATCH_PACKAGES,
      });
    }

    await db.insert(schema.loadingManifests).values(manifests);
    await db.insert(schema.loadingManifestLines).values(lines);

    if (end % 10_000 === 0 || end === count) {
      console.log(`  погрузочные … ${end} / ${count} (${elapsedMs(t0)} ms)`);
    }
  }
  return elapsedMs(t0);
}

if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL");
  process.exit(1);
}

const { db, sql } = createDb(process.env.DATABASE_URL);
const tripsRepo = new DrizzleTripRepository(db);

try {
  const bulkPdRow = await sql<{ c: number }>`
    select count(*)::int as c from purchase_documents where id like 'ARCHIVE-BULK-pd-%'
  `;
  const bulkTripsRow = await sql<{ c: number }>`
    select count(*)::int as c from trips where id like 'ARCHIVE-BULK-trip-%'
  `;
  const bulkPd = bulkPdRow[0]?.c ?? 0;
  const bulkTrips = bulkTripsRow[0]?.c ?? 0;
  if (
    process.env.BIRZHA_ARCHIVE_FORCE !== "1" &&
    bulkPd >= NKL_COUNT &&
    bulkTrips >= TRIP_COUNT
  ) {
    console.log(`ARCHIVE-BULK уже на месте: накладных ${bulkPd}, рейсов ${bulkTrips}.`);
    console.log("Повторная загрузка не нужна. Проверка:");
    console.log(
      `  BIRZHA_ARCHIVE_MIN_CLOSED=${TRIP_COUNT} BIRZHA_ARCHIVE_MIN_DOCS=${NKL_COUNT} BIRZHA_ARCHIVE_MIN_MANIFESTS=${MANIFEST_COUNT} pnpm db:verify-archive`,
    );
    console.log("Принудительно заново: BIRZHA_ARCHIVE_FORCE=1 pnpm db:seed-archive-max-stress");
    process.exit(0);
  }

  if (!SKIP_CLEANUP) {
    await cleanupArchiveBulk(sql);
  }

  const nklMs = await seedArchivedPurchaseDocuments(db, NKL_COUNT);
  const tripMs = await seedClosedTrips(db, TRIP_COUNT);
  const manifestMs = await seedArchivedManifests(db, MANIFEST_COUNT, NKL_COUNT);

  const closedRow = await sql<{ c: number }>`select count(*)::int as c from trips where status = 'closed'`;
  const archivedNklRow = await sql<{ c: number }>`
    select count(*)::int as c from purchase_documents pd
    where exists (select 1 from purchase_document_lines pdl where pdl.document_id = pd.id)
      and not exists (
        select 1 from purchase_document_lines pdl
        inner join batches b on b.id = pdl.batch_id
        where pdl.document_id = pd.id
          and (b.pending_inbound_grams > 0 or b.on_warehouse_grams > 0 or b.in_transit_grams > 0)
      )
  `;
  const archivedLmRow = await sql<{ c: number }>`
    select count(*)::int as c
    from loading_manifests lm
    inner join trips t on t.id = lm.trip_id
    where t.status = 'closed'
  `;

  const tTrips0 = performance.now();
  const tripsPage0 = await tripsRepo.list({ status: "closed", limit: 25, offset: 0 });
  const trips0Ms = elapsedMs(tTrips0);

  const closedTotal = closedRow[0]?.c ?? 0;
  const tripsDeepOffset = Math.max(0, closedTotal - 25);
  const tTripsDeep = performance.now();
  await tripsRepo.list({ status: "closed", limit: 25, offset: tripsDeepOffset });
  const tripsDeepMs = elapsedMs(tTripsDeep);

  const archivedNklTotal = archivedNklRow[0]?.c ?? 0;
  const tNkl0 = performance.now();
  await listPurchaseDocumentsForHttp(db, { scope: "archived", limit: 25, offset: 0 });
  const nkl0Ms = elapsedMs(tNkl0);
  const nklDeepOffset = Math.max(0, archivedNklTotal - 25);
  const tNklDeep = performance.now();
  await listPurchaseDocumentsForHttp(db, { scope: "archived", limit: 25, offset: nklDeepOffset });
  const nklDeepMs = elapsedMs(tNklDeep);

  const tLm0 = performance.now();
  const lmPage = await listLoadingManifestsForHttp(db, { scope: "archived", limit: 25, offset: 0 });
  const lm0Ms = elapsedMs(tLm0);

  console.log("");
  console.log("Готово (max stress):");
  console.log(`  • закупочные: ${NKL_COUNT} inserted (${nklMs} ms), в архиве всего: ${archivedNklTotal}`);
  console.log(`  • closed trips: ${TRIP_COUNT} inserted (${tripMs} ms), всего closed: ${closedTotal}`);
  console.log(`  • archived manifests: ${MANIFEST_COUNT} inserted (${manifestMs} ms), всего: ${archivedLmRow[0]?.c ?? 0}`);
  console.log(`  • list trips p1: ${trips0Ms} ms (${tripsPage0.length} rows), deep offset=${tripsDeepOffset}: ${tripsDeepMs} ms`);
  console.log(`  • list naklad p1: ${nkl0Ms} ms, deep offset=${nklDeepOffset}: ${nklDeepMs} ms`);
  console.log(`  • list manifests p1: ${lm0Ms} ms, total=${lmPage.listMeta.totalCount}`);
  console.log("");
  console.log("Проверка:");
  console.log(
    `  BIRZHA_ARCHIVE_MIN_CLOSED=${TRIP_COUNT} BIRZHA_ARCHIVE_MIN_DOCS=${NKL_COUNT} BIRZHA_ARCHIVE_MIN_MANIFESTS=${MANIFEST_COUNT} pnpm db:verify-archive`,
  );
} finally {
  await sql.end({ timeout: 10 });
}
