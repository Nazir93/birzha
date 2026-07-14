import { and, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";

import type { DbClient } from "../../db/client.js";
import { loadingManifestLines, loadingManifests, trips } from "../../db/schema.js";

/** ПН «в работе»: без рейса, рейс не закрыт или trip row отсутствует. */
function activeManifestScopeWhere(): SQL {
  return or(
    sql`${loadingManifests.tripId} IS NULL`,
    sql`${trips.status} IS NULL`,
    sql`${trips.status} <> 'closed'`,
  )!;
}

/** Сумма граммов партии в активных ПН (опционально без текущего документа). */
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
  const clauses: SQL[] = [inArray(loadingManifestLines.batchId, ids), activeManifestScopeWhere()];
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
    .leftJoin(trips, eq(loadingManifests.tripId, trips.id))
    .where(and(...clauses))
    .groupBy(loadingManifestLines.batchId);

  for (const row of rows) {
    out.set(row.batchId, BigInt(row.grams));
  }
  return out;
}
