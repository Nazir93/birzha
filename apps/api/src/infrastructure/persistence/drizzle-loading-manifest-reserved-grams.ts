import { and, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";

import type { DbClient } from "../../db/client.js";
import { loadingManifestLines, loadingManifests } from "../../db/schema.js";

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
