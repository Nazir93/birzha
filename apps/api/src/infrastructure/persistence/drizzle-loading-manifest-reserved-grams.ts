import { and, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";

import type { DbClient } from "../../db/client.js";
import { batches, loadingManifestLines, loadingManifests } from "../../db/schema.js";

/**
 * Резерв под новую ПН/догрузку: только строки черновых ПН (ещё без рейса).
 * После привязки к рейсу товар уже уходит в inTransit / снимается с onWarehouse —
 * такие строки больше не вычитаем из остатка на складе (иначе «хвост» на складе
 * нельзя догрузить в другой рейс).
 */
export async function sumActiveLoadingManifestGramsByBatchIds(
  db: DbClient,
  batchIds: readonly string[],
  opts?: { excludeManifestId?: string },
): Promise<Map<string, bigint>> {
  const ids = [...new Set(batchIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, bigint>();
  if (ids.length === 0) {
    return out;
  }
  const clauses: SQL[] = [inArray(loadingManifestLines.batchId, ids), isNull(loadingManifests.tripId)];
  const exclude = opts?.excludeManifestId?.trim();
  if (exclude) {
    clauses.push(ne(loadingManifests.id, exclude));
  }
  const rows = await db
    .select({
      batchId: loadingManifestLines.batchId,
      grams: sql<string>`coalesce(sum(${loadingManifestLines.grams}), 0)`.mapWith(String),
    })
    .from(loadingManifestLines)
    .innerJoin(loadingManifests, eq(loadingManifests.id, loadingManifestLines.manifestId))
    .where(and(...clauses))
    .groupBy(loadingManifestLines.batchId);

  for (const row of rows) {
    out.set(row.batchId, BigInt(row.grams));
  }
  return out;
}

/**
 * Партия «полностью в резерве» черновых ПН: на складе нет свободных кг сверх строк ПН.
 * Частичный возврат из отбора оставляет хвост на складе — такую партию нельзя прятать
 * целиком из списка погрузки (иначе возвращённое нельзя снова взять в ПН/догрузку).
 */
export function isBatchFullyReservedOnDraftManifests(input: {
  onWarehouseGrams: bigint;
  reservedOnDraftManifestsGrams: bigint;
}): boolean {
  const reserved =
    input.reservedOnDraftManifestsGrams > 0n ? input.reservedOnDraftManifestsGrams : 0n;
  return reserved > 0n && reserved >= input.onWarehouseGrams;
}

/**
 * Ящики уже в строках ПН (черновик и с рейсом): сумма `packageCount` по партии.
 * В Map только партии, у которых хотя бы у одной строки ящики заданы явно —
 * тогда UI считает остаток на складе как «закупка − факт ПН», а не пропорцию кг.
 */
export async function sumLoadingManifestPackagesByBatchIds(
  db: DbClient,
  batchIds: readonly string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(batchIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, number>();
  if (ids.length === 0) {
    return out;
  }
  const rows = await db
    .select({
      batchId: loadingManifestLines.batchId,
      sumPackages: sql<string>`coalesce(sum(${loadingManifestLines.packageCount}), 0)`.mapWith(String),
      explicitLines: sql<number>`count(${loadingManifestLines.packageCount})::int`,
    })
    .from(loadingManifestLines)
    .where(inArray(loadingManifestLines.batchId, ids))
    .groupBy(loadingManifestLines.batchId);

  for (const row of rows) {
    if (row.explicitLines <= 0) {
      continue;
    }
    const n = Number(row.sumPackages);
    out.set(row.batchId, Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
  }
  return out;
}

/** ID партий склада, у которых весь остаток уже в черновых ПН (без рейса). */
export async function listFullyReservedDraftManifestBatchIds(
  db: DbClient,
  warehouseId: string,
): Promise<string[]> {
  const wh = warehouseId.trim();
  if (!wh) {
    return [];
  }
  const rows = await db
    .select({
      batchId: loadingManifestLines.batchId,
      reservedGrams: sql<string>`coalesce(sum(${loadingManifestLines.grams}), 0)`.mapWith(String),
      onWarehouseGrams: batches.onWarehouseGrams,
    })
    .from(loadingManifestLines)
    .innerJoin(loadingManifests, eq(loadingManifests.id, loadingManifestLines.manifestId))
    .innerJoin(batches, eq(batches.id, loadingManifestLines.batchId))
    .where(and(eq(loadingManifests.warehouseId, wh), isNull(loadingManifests.tripId)))
    .groupBy(loadingManifestLines.batchId, batches.onWarehouseGrams);

  return rows
    .filter((r) =>
      isBatchFullyReservedOnDraftManifests({
        onWarehouseGrams: r.onWarehouseGrams,
        reservedOnDraftManifestsGrams: BigInt(r.reservedGrams),
      }),
    )
    .map((r) => r.batchId);
}
