import { eq, gt, or, sql } from "drizzle-orm";

import type { DbClient } from "../db/client.js";
import { batches, purchaseDocumentLines, purchaseDocuments, warehouses } from "../db/schema.js";

function gramsToKg(grams: bigint): number {
  return Number(grams) / 1000;
}

/** Суммирует копейки из SQL (bigint | string | number) без конкатенации строк. */
export function sumKopecksField(acc: bigint, value: bigint | string | number | null | undefined): bigint {
  if (value == null) {
    return acc;
  }
  return acc + BigInt(value);
}

/** Сводка остатков для бухгалтерии без полного GET /batches. */
export async function getStockBalancesSummary(db: DbClient) {
  const rows = await db
    .select({
      warehouseId: purchaseDocuments.warehouseId,
      warehouseName: warehouses.name,
      warehouseCode: warehouses.code,
      onWarehouseGrams: sql<bigint>`coalesce(sum(${batches.onWarehouseGrams}), 0)`,
      inTransitGrams: sql<bigint>`coalesce(sum(${batches.inTransitGrams}), 0)`,
      onWarehousePackages: sql<number>`coalesce(sum(
        case when ${batches.totalGrams} > 0 then
          ${batches.onWarehouseGrams}::numeric / ${batches.totalGrams}::numeric * coalesce(${purchaseDocumentLines.packageCount}, 0)
        else 0 end
      ), 0)::float`,
      valueWhKopecks: sql<bigint>`coalesce(sum((${batches.onWarehouseGrams}::numeric * ${purchaseDocumentLines.pricePerKg} * 100 / 1000)::bigint), 0)`,
      valueTrKopecks: sql<bigint>`coalesce(sum((${batches.inTransitGrams}::numeric * ${purchaseDocumentLines.pricePerKg} * 100 / 1000)::bigint), 0)`,
    })
    .from(batches)
    .innerJoin(purchaseDocumentLines, eq(purchaseDocumentLines.batchId, batches.id))
    .innerJoin(purchaseDocuments, eq(purchaseDocuments.id, purchaseDocumentLines.documentId))
    .innerJoin(warehouses, eq(warehouses.id, purchaseDocuments.warehouseId))
    .where(or(gt(batches.onWarehouseGrams, 0n), gt(batches.inTransitGrams, 0n)))
    .groupBy(purchaseDocuments.warehouseId, warehouses.name, warehouses.code);

  let totalWarehouseKg = 0;
  let totalTransitKg = 0;
  let totalWhKopecks = 0n;
  let totalTrKopecks = 0n;
  const byWarehouse = rows.map((r) => {
    const whKg = gramsToKg(r.onWarehouseGrams);
    const trKg = gramsToKg(r.inTransitGrams);
    totalWarehouseKg += whKg;
    totalTransitKg += trKg;
    totalWhKopecks = sumKopecksField(totalWhKopecks, r.valueWhKopecks);
    totalTrKopecks = sumKopecksField(totalTrKopecks, r.valueTrKopecks);
    return {
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      warehouseCode: r.warehouseCode,
      onWarehouseKg: whKg,
      onWarehousePackages: Math.round(r.onWarehousePackages),
      inTransitKg: trKg,
      valueWarehouseKopecks: r.valueWhKopecks.toString(),
      valueTransitKopecks: r.valueTrKopecks.toString(),
    };
  });

  return {
    totals: {
      onWarehouseKg: totalWarehouseKg,
      inTransitKg: totalTransitKg,
      valueWarehouseKopecks: totalWhKopecks.toString(),
      valueTransitKopecks: totalTrKopecks.toString(),
    },
    byWarehouse,
  };
}
