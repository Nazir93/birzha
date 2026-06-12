/**
 * Массовая нагрузка **архива закупочных накладных** (полностью проданные партии, без API).
 * Добавляет данные поверх существующего архива рейсов (не делает reset).
 *
 *   cd apps/api
 *   BIRZHA_ARCHIVE_NKL_COUNT=50000 pnpm db:seed-archive-nakladnaya-bulk
 *
 * Переменные:
 * - BIRZHA_ARCHIVE_NKL_COUNT — сколько накладных (по умолчанию 50000)
 * - BIRZHA_ARCHIVE_NKL_CHUNK — размер чанка insert (по умолчанию 1000)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { like } from "drizzle-orm";

import { createDb } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import { listPurchaseDocumentsForHttp } from "../src/http/purchase-document-list-http.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const PREFIX = "ARCHIVE-BULK-";
const DOC_COUNT = Math.max(1, Number(process.env.BIRZHA_ARCHIVE_NKL_COUNT ?? 50_000));
const CHUNK_SIZE = Math.max(100, Number(process.env.BIRZHA_ARCHIVE_NKL_CHUNK ?? 1000));

const WAREHOUSES = ["wh-manas", "wh-kayakent"] as const;
const GRADE_ID = "pg-n5";
const BATCH_GRAMS = 100_000n;
const BATCH_PACKAGES = 20n;
const PRICE_PER_KG = "48.000000";
const LINE_KOPECKS = 480_000n;

function warehouseForIndex(i: number): (typeof WAREHOUSES)[number] {
  return WAREHOUSES[i % WAREHOUSES.length]!;
}

function docDateForIndex(i: number): string {
  const year = 2020 + (i % 6);
  const month = (i % 12) + 1;
  const day = (i % 28) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

async function seedArchivedPurchaseDocuments(
  db: ReturnType<typeof createDb>["db"],
  count: number,
): Promise<number> {
  const t0 = performance.now();
  let inserted = 0;

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
        destination: j % 2 === 0 ? "moscow" : "regions",
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

    inserted = end;
    if (inserted % 5000 === 0 || inserted === count) {
      console.log(`  … ${inserted} / ${count} (${elapsedMs(t0)} ms)`);
    }
  }

  return elapsedMs(t0);
}

if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL в apps/api/.env");
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
    console.error(`Уже есть накладные ${PREFIX}…. Удалите их или сделайте reset.`);
    process.exit(2);
  }

  console.log(`Архив закупочных: ${DOC_COUNT} накладных (chunk=${CHUNK_SIZE}), префикс ${PREFIX}`);
  const insertMs = await seedArchivedPurchaseDocuments(db, DOC_COUNT);

  const archivedCountRow = await sql<{ c: number }>`
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
  const archivedTotal = archivedCountRow[0]?.c ?? 0;

  const tList0 = performance.now();
  const page0 = await listPurchaseDocumentsForHttp(db, { scope: "archived", limit: 25, offset: 0 });
  const list0Ms = elapsedMs(tList0);

  const deepOffset = Math.max(0, archivedTotal - 25);
  const tListDeep = performance.now();
  const pageDeep = await listPurchaseDocumentsForHttp(db, {
    scope: "archived",
    limit: 25,
    offset: deepOffset,
  });
  const listDeepMs = elapsedMs(tListDeep);

  console.log("");
  console.log("Готово:");
  console.log(`  • вставлено ${PREFIX}: ${DOC_COUNT} (${insertMs} ms)`);
  console.log(`  • всего в архиве (закупочные): ${archivedTotal}`);
  console.log(`  • list archived offset=0: ${list0Ms} ms, total=${page0.listMeta.totalCount}`);
  console.log(`  • list archived offset=${deepOffset}: ${listDeepMs} ms, rows=${pageDeep.purchaseDocuments.length}`);
  console.log(`  • проверка: BIRZHA_ARCHIVE_MIN_DOCS=${archivedTotal} pnpm db:verify-archive`);
} finally {
  await sql.end({ timeout: 5 });
}
