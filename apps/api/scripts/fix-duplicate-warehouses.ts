/**
 * Удаляет пустые дубликаты складов (одинаковое название, нет накладных и остатков).
 *
 *   cd apps/api
 *   pnpm db:fix-duplicate-warehouses
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eq, sql } from "drizzle-orm";
import dotenv from "dotenv";

import { createDb } from "../src/db/client.js";
import { batches, purchaseDocumentLines, purchaseDocuments, warehouses } from "../src/db/schema.js";
import { normalizeWarehouseName } from "../src/infrastructure/persistence/warehouse-name.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL в apps/api/.env");
  process.exit(1);
}

const { db, sql: pg } = createDb(process.env.DATABASE_URL);

try {
  const rows = await db.select({ id: warehouses.id, code: warehouses.code, name: warehouses.name }).from(warehouses);

  const byName = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = normalizeWarehouseName(row.name);
    const list = byName.get(key) ?? [];
    list.push(row);
    byName.set(key, list);
  }

  const duplicateGroups = [...byName.entries()].filter(([, list]) => list.length > 1);
  if (duplicateGroups.length === 0) {
    console.log("Дубликатов по названию нет.");
    process.exit(0);
  }

  let removed = 0;
  for (const [, list] of duplicateGroups) {
    console.log(`\nДубликаты «${list[0]!.name}» (${list.length} шт.):`);
    let removedInGroup = 0;
    for (const w of list) {
      const [docRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(purchaseDocuments)
        .where(eq(purchaseDocuments.warehouseId, w.id));
      const [kgRow] = await db
        .select({
          grams: sql<bigint>`coalesce(sum(${batches.onWarehouseGrams}), 0)`,
        })
        .from(batches)
        .innerJoin(purchaseDocumentLines, eq(purchaseDocumentLines.batchId, batches.id))
        .innerJoin(purchaseDocuments, eq(purchaseDocuments.id, purchaseDocumentLines.documentId))
        .where(eq(purchaseDocuments.warehouseId, w.id));

      const docCount = docRow?.count ?? 0;
      const kg = Number(kgRow?.grams ?? 0n) / 1000;
      console.log(`  ${w.id} · ${w.code} · накладных: ${docCount} · на складе: ${kg} кг`);

      if (docCount === 0 && kg <= 0) {
        await db.delete(warehouses).where(eq(warehouses.id, w.id));
        console.log(`  → удалён пустой дубликат ${w.id}`);
        removed += 1;
        removedInGroup += 1;
      }
    }
    const remaining = list.length - removedInGroup;
    if (remaining > 1) {
      console.warn(`  ⚠ осталось ${remaining} складов с именем «${list[0]!.name}» — удалите вручную лишний с данными.`);
    }
  }

  console.log(`\nГотово: удалено пустых дубликатов: ${removed}.`);
} finally {
  await pg.end({ timeout: 5 });
}
