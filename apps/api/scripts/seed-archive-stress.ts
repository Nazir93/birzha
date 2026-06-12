/**
 * Нагрузка **архива**: закрытые рейсы, погрузочные на закрытых рейсах, полностью проданные накладные.
 *
 * Рекомендуемый порядок:
 *   cd apps/api
 *   pnpm db:reset-test-data
 *   BIRZHA_DEMO_SEED_PASSWORD='…' pnpm db:seed-demo
 *   pnpm db:seed-archive-stress
 *   pnpm db:verify-archive
 *
 * Переменные:
 * - BIRZHA_ARCHIVE_TRIP_COUNT — сколько доп. закрытых рейсов (по умолчанию 50, >25 для пагинации UI)
 * - BIRZHA_ARCHIVE_CLOSE_DEMO=0 — не закрывать demo-trip-r101..r105
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eq, like } from "drizzle-orm";
import dotenv from "dotenv";
import {
  numberToDecimalStringForKopecks,
  purchaseLineAmountKopecksFromDecimalStrings,
} from "@birzha/contracts";

import { loadEnv } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const PREFIX = "ARCHIVE-";
const TRIP_COUNT = Math.max(1, Number(process.env.BIRZHA_ARCHIVE_TRIP_COUNT ?? 50));
const CLOSE_DEMO = process.env.BIRZHA_ARCHIVE_CLOSE_DEMO !== "0";

const WH_IDS = ["wh-manas", "wh-kayakent"] as const;
const GRADE_ID = "pg-n5";
const BATCH_KG = 100;
const PRICE_PER_KG = 48;

const DEMO_TRIPS_TO_CLOSE = [
  "demo-trip-r101",
  "demo-trip-r102",
  "demo-trip-r103",
  "demo-trip-r104",
  "demo-trip-r105",
] as const;

function lineKop(kg: number, rubPerKg: number): number {
  return purchaseLineAmountKopecksFromDecimalStrings(
    numberToDecimalStringForKopecks(kg, 6),
    numberToDecimalStringForKopecks(rubPerKg, 4),
  );
}

function warehouseForIndex(i: number): (typeof WH_IDS)[number] {
  return WH_IDS[i % WH_IDS.length]!;
}

function docDateForIndex(i: number): string {
  const day = (i % 28) + 1;
  return `2025-12-${String(day).padStart(2, "0")}`;
}

function departedAtForIndex(i: number): string {
  const hour = String((i % 9) + 8).padStart(2, "0");
  return `${docDateForIndex(i)}T${hour}:00:00.000Z`;
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
  if (res.statusCode === 204 || res.body.length === 0) {
    return undefined as T;
  }
  return JSON.parse(res.body) as T;
}

type DocLine = { batchId: string; lineNo: number; productGradeCode: string };

async function seedClosedArchiveTrip(app: FastifyInstance, i: number): Promise<string> {
  const docId = `${PREFIX}pd-${i}`;
  const tripId = `${PREFIX}trip-${i}`;
  const manifestId = `${PREFIX}lm-${i}`;
  const saleId = `${PREFIX}sale-${i}`;
  const wh = warehouseForIndex(i);

  await injectJson(app, `pd ${i}`, "POST", "/purchase-documents", {
    id: docId,
    documentNumber: `${PREFIX}NKL-${String(i + 1).padStart(4, "0")}`,
    docDate: docDateForIndex(i),
    warehouseId: wh,
    supplierName: `${PREFIX}Поставщик`,
    lines: [
      {
        productGradeId: GRADE_ID,
        totalKg: BATCH_KG,
        packageCount: 20,
        pricePerKg: PRICE_PER_KG,
        lineTotalKopecks: lineKop(BATCH_KG, PRICE_PER_KG),
      },
    ],
  });

  const detail = await injectJson<{ lines: DocLine[] }>(app, `get pd ${i}`, "GET", `/purchase-documents/${docId}`);
  const batchId = detail.lines[0]?.batchId;
  if (!batchId) {
    throw new Error(`Нет batchId у ${docId}`);
  }

  await injectJson(app, `trip ${i}`, "POST", "/trips", {
    id: tripId,
    tripNumber: `${PREFIX}Р-${String(i + 1).padStart(4, "0")}`,
    vehicleLabel: `${PREFIX}Рейс ${i + 1}`,
    driverName: "Архив-тест",
    departedAt: departedAtForIndex(i),
  });

  await injectJson(app, `manifest ${i}`, "POST", "/loading-manifests", {
    id: manifestId,
    manifestNumber: `${PREFIX}ПН-${String(i + 1).padStart(4, "0")}`,
    docDate: docDateForIndex(i),
    warehouseId: wh,
    destinationCode: "regions",
    batchIds: [batchId],
  });

  await injectJson(
    app,
    `assign manifest ${i}`,
    "POST",
    `/loading-manifests/${encodeURIComponent(manifestId)}/assign-trip`,
    { tripId },
  );

  await injectJson(app, `sell ${i}`, "POST", `/batches/${encodeURIComponent(batchId)}/sell-from-trip`, {
    tripId,
    kg: BATCH_KG,
    saleId,
    pricePerKg: PRICE_PER_KG + 10,
    packageCount: 20,
    paymentKind: "cash",
    saleChannel: "retail",
    clientLabel: `${PREFIX}Клиент ${i + 1}`,
  });

  await injectJson(app, `close ${i}`, "POST", `/trips/${encodeURIComponent(tripId)}/close`, {});
  return tripId;
}

if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL в apps/api/.env");
  process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("Нужен JWT_SECRET не короче 32 символов.");
  process.exit(1);
}

const { db, sql } = createDb(process.env.DATABASE_URL);

try {
  const existing = await db
    .select({ n: schema.purchaseDocuments.documentNumber })
    .from(schema.purchaseDocuments)
    .where(like(schema.purchaseDocuments.documentNumber, `${PREFIX}%`))
    .limit(1);
  if (existing.length > 0) {
    console.error(`В базе уже есть накладные ${PREFIX}…. Сначала pnpm db:reset-test-data или удалите их.`);
    process.exit(2);
  }

  const env = loadEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: "development",
    REQUIRE_API_AUTH: "false",
  });
  const app = await buildApp({ env, db });

  let closedDemo = 0;
  if (CLOSE_DEMO) {
    console.log(`Закрытие демо-рейсов (${DEMO_TRIPS_TO_CLOSE.length} шт.) …`);
    for (const tripId of DEMO_TRIPS_TO_CLOSE) {
      const rows = await db
        .select({ id: schema.trips.id, status: schema.trips.status })
        .from(schema.trips)
        .where(eq(schema.trips.id, tripId));
      const row = rows[0];
      if (!row) {
        console.log(`  пропуск ${tripId} — нет в БД (seed-demo не запускали?)`);
        continue;
      }
      if (row.status === "closed") {
        console.log(`  уже закрыт: ${tripId}`);
        closedDemo += 1;
        continue;
      }
      await injectJson(app, `close demo ${tripId}`, "POST", `/trips/${encodeURIComponent(tripId)}/close`, {});
      closedDemo += 1;
    }
  }

  console.log(`Создание ${TRIP_COUNT} закрытых рейсов ${PREFIX}…`);
  const sampleTripIds: string[] = [];
  for (let i = 0; i < TRIP_COUNT; i += 1) {
    const tripId = await seedClosedArchiveTrip(app, i);
    if (i < 3) {
      sampleTripIds.push(tripId);
    }
    if ((i + 1) % 10 === 0 || i + 1 === TRIP_COUNT) {
      console.log(`  … ${i + 1} / ${TRIP_COUNT}`);
    }
  }

  await app.close();

  const closedCountRow = await sql<{ c: number }>`select count(*)::int as c from trips where status = 'closed'`;
  const archivedManifestRow = await sql<{ c: number }>`
    select count(*)::int as c
    from loading_manifests lm
    inner join trips t on t.id = lm.trip_id
    where t.status = 'closed'
  `;
  const archivedPdRow = await sql<{ c: number }>`
    select count(*)::int as c
    from purchase_documents pd
    where exists (select 1 from purchase_document_lines pdl where pdl.document_id = pd.id)
      and not exists (
        select 1
        from purchase_document_lines pdl
        inner join batches b on b.id = pdl.batch_id
        where pdl.document_id = pd.id
          and (b.pending_inbound_grams > 0 or b.on_warehouse_grams > 0 or b.in_transit_grams > 0)
      )
  `;

  console.log("");
  console.log("Готово:");
  console.log(`  • закрыто демо-рейсов: ${closedDemo}`);
  console.log(`  • новых закрытых ${PREFIX}: ${TRIP_COUNT}`);
  console.log(`  • всего closed trips в БД: ${closedCountRow[0]?.c ?? 0}`);
  console.log(`  • погрузочных на closed: ${archivedManifestRow[0]?.c ?? 0}`);
  console.log(`  • закупочных без остатка (архив): ${archivedPdRow[0]?.c ?? 0}`);
  console.log(`  • проверка: pnpm db:verify-archive`);
  if (sampleTripIds[0]) {
    console.log(`  • пример tripId для UI: ${sampleTripIds[0]}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
