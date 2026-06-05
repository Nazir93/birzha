/**
 * Нагрузочный стенд: много погрузочных накладных, рейсов и партий на разных складах.
 *
 *   cd apps/api
 *   pnpm db:reset-test-data
 *   BIRZHA_LOAD_MANIFEST_COUNT=5000 BIRZHA_LOAD_TRIP_COUNT=500 pnpm db:seed-load-test
 *
 * Префикс данных: LOADTEST-. Повторный запуск при наличии таких данных — ошибка (сначала reset).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { like } from "drizzle-orm";

import { loadEnv } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const PREFIX = "LOADTEST-";
const MANIFEST_COUNT = Math.max(1, Number(process.env.BIRZHA_LOAD_MANIFEST_COUNT ?? 5000));
const TRIP_COUNT = Math.max(1, Number(process.env.BIRZHA_LOAD_TRIP_COUNT ?? 500));
const CHUNK_SIZE = Math.max(50, Number(process.env.BIRZHA_LOAD_CHUNK_SIZE ?? 250));
const VIA_API_SAMPLE = Math.max(0, Number(process.env.BIRZHA_LOAD_VIA_API_SAMPLE ?? 0));

const WAREHOUSES = ["wh-manas", "wh-kayakent"] as const;
const DESTINATIONS = ["moscow", "regions"] as const;
const GRADE_ID = "pg-n5";
const BATCH_GRAMS = 100_000n;
const BATCH_PACKAGES = 20n;
const PRICE_PER_KG = "45.000000";
const LINE_KOPECKS = 450_000n;

type TimedStep = { label: string; ms: number; count: number };

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function warehouseForIndex(i: number): (typeof WAREHOUSES)[number] {
  return WAREHOUSES[i % WAREHOUSES.length]!;
}

function destinationForIndex(i: number): (typeof DESTINATIONS)[number] {
  return DESTINATIONS[i % DESTINATIONS.length]!;
}

function docDateForIndex(i: number): string {
  const day = (i % 28) + 1;
  return `2026-03-${String(day).padStart(2, "0")}`;
}

async function injectJson<T>(
  app: FastifyInstance,
  label: string,
  method: string,
  url: string,
  payload?: unknown,
): Promise<T> {
  const res = await app.inject({ method, url, payload });
  if (res.statusCode >= 400) {
    console.error(`${label} ${method} ${url} → ${res.statusCode}`, res.body);
    throw new Error(`${label}: HTTP ${res.statusCode}`);
  }
  return JSON.parse(res.body) as T;
}

async function seedPurchaseBatches(
  db: ReturnType<typeof createDb>["db"],
  count: number,
  idOffset = 0,
  idPrefix = "lt",
): Promise<{ batchIds: string[]; ms: number }> {
  const t0 = performance.now();
  const batchIds: string[] = [];

  for (let start = 0; start < count; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, count);
    const docs: (typeof schema.purchaseDocuments.$inferInsert)[] = [];
    const lines: (typeof schema.purchaseDocumentLines.$inferInsert)[] = [];
    const batches: (typeof schema.batches.$inferInsert)[] = [];

    for (let j = start; j < end; j += 1) {
      const i = idOffset + j;
      const docId = `${idPrefix}-pd-${i}`;
      const batchId = `${idPrefix}-batch-${i}`;
      const warehouseId = warehouseForIndex(i);
      batchIds.push(batchId);

      docs.push({
        id: docId,
        documentNumber: `${PREFIX}NKL-${i}`,
        docDate: new Date(`${docDateForIndex(i)}T00:00:00.000Z`),
        warehouseId,
        supplierName: `${PREFIX}Поставщик`,
      });
      batches.push({
        id: batchId,
        purchaseId: docId,
        totalGrams: BATCH_GRAMS,
        pendingInboundGrams: 0n,
        onWarehouseGrams: BATCH_GRAMS,
        inTransitGrams: 0n,
        soldGrams: 0n,
        writtenOffGrams: 0n,
        pricePerKg: PRICE_PER_KG,
        warehouseId,
        destination: destinationForIndex(i),
      });
      lines.push({
        id: `${idPrefix}-pdl-${i}`,
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
  }

  return { batchIds, ms: elapsedMs(t0) };
}

async function seedTrips(db: ReturnType<typeof createDb>["db"], count: number): Promise<{ tripIds: string[]; ms: number }> {
  const t0 = performance.now();
  const tripIds: string[] = [];

  for (const part of chunk(Array.from({ length: count }, (_, i) => i), CHUNK_SIZE)) {
    const rows = part.map((i) => {
      const id = `lt-trip-${i}`;
      tripIds.push(id);
      return {
        id,
        tripNumber: `${PREFIX}Р-${String(i + 1).padStart(4, "0")}`,
        status: "open",
        vehicleLabel: `Рейс ${i + 1}`,
        driverName: "Нагрузочный тест",
        departedAt: new Date("2026-03-10T06:00:00.000Z"),
      } satisfies typeof schema.trips.$inferInsert;
    });
    await db.insert(schema.trips).values(rows);
  }

  return { tripIds, ms: elapsedMs(t0) };
}

async function seedLoadingManifests(
  db: ReturnType<typeof createDb>["db"],
  batchIds: string[],
  tripIds: string[],
): Promise<{ manifestIds: string[]; ms: number }> {
  const t0 = performance.now();
  const manifestIds: string[] = [];
  const count = batchIds.length;

  for (let start = 0; start < count; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, count);
    const manifests: (typeof schema.loadingManifests.$inferInsert)[] = [];
    const lines: (typeof schema.loadingManifestLines.$inferInsert)[] = [];

    for (let i = start; i < end; i += 1) {
      const manifestId = `lt-lm-${i}`;
      const batchId = batchIds[i]!;
      const warehouseId = warehouseForIndex(i);
      const destinationCode = destinationForIndex(i);
      const tripId = tripIds[i % tripIds.length] ?? null;
      manifestIds.push(manifestId);

      manifests.push({
        id: manifestId,
        manifestNumber: `${PREFIX}ПН-${String(i + 1).padStart(5, "0")} · ${destinationCode}`,
        docDate: new Date(`${docDateForIndex(i)}T00:00:00.000Z`),
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
  }

  return { manifestIds, ms: elapsedMs(t0) };
}

async function seedManifestsViaApi(
  app: FastifyInstance,
  batchIds: string[],
  sampleCount: number,
): Promise<{ ms: number; ok: number }> {
  const t0 = performance.now();
  let ok = 0;
  const count = Math.min(sampleCount, batchIds.length);

  for (let i = 0; i < count; i += 1) {
    const batchId = batchIds[i]!;
    await injectJson(app, `api-manifest-${i}`, "POST", "/loading-manifests", {
      id: `lt-api-lm-${i}`,
      manifestNumber: `${PREFIX}API-${String(i + 1).padStart(4, "0")}`,
      docDate: docDateForIndex(i),
      warehouseId: warehouseForIndex(i),
      destinationCode: destinationForIndex(i),
      batchIds: [batchId],
    });
    ok += 1;
  }

  return { ms: elapsedMs(t0), ok };
}

if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL в apps/api/.env");
  process.exit(1);
}

const { db, sql } = createDb(process.env.DATABASE_URL);

try {
  const existing = await db
    .select({ n: schema.loadingManifests.manifestNumber })
    .from(schema.loadingManifests)
    .where(like(schema.loadingManifests.manifestNumber, `${PREFIX}%`))
    .limit(1);

  if (existing.length > 0) {
    console.error(`В базе уже есть погрузочные ${PREFIX}…. Сначала: pnpm db:reset-test-data`);
    process.exit(2);
  }

  const steps: TimedStep[] = [];

  console.log(`Нагрузочный сид: ${MANIFEST_COUNT} погрузочных, ${TRIP_COUNT} рейсов, склады: ${WAREHOUSES.join(", ")}`);

  const batchesStep = await seedPurchaseBatches(db, MANIFEST_COUNT);
  steps.push({ label: "закупочные накладные + партии", ms: batchesStep.ms, count: MANIFEST_COUNT });

  const tripsStep = await seedTrips(db, TRIP_COUNT);
  steps.push({ label: "рейсы", ms: tripsStep.ms, count: TRIP_COUNT });

  const manifestsStep = await seedLoadingManifests(db, batchesStep.batchIds, tripsStep.tripIds);
  steps.push({ label: "погрузочные накладные", ms: manifestsStep.ms, count: MANIFEST_COUNT });

  if (VIA_API_SAMPLE > 0) {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      console.error("BIRZHA_LOAD_VIA_API_SAMPLE > 0: нужен JWT_SECRET не короче 32 символов.");
      process.exit(1);
    }
    const env = loadEnv({
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      NODE_ENV: "development",
      REQUIRE_API_AUTH: "false",
    });
    const app = await buildApp({ env, db });
    const extraBatchStep = await seedPurchaseBatches(db, VIA_API_SAMPLE, MANIFEST_COUNT, "lt-api");
    const apiStep = await seedManifestsViaApi(app, extraBatchStep.batchIds, VIA_API_SAMPLE);
    steps.push({ label: "погрузочные через POST /loading-manifests (выборка)", ms: apiStep.ms, count: apiStep.ok });
    await app.close();
  }

  const totalMs = steps.reduce((sum, s) => sum + s.ms, 0);
  console.log(
    JSON.stringify(
      {
        ok: true,
        prefix: PREFIX,
        manifestCount: MANIFEST_COUNT,
        tripCount: TRIP_COUNT,
        warehouses: WAREHOUSES,
        steps,
        totalMs,
        next: [
          "pnpm dev:api",
          "pnpm load:distribution",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
