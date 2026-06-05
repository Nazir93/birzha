import { and, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { DbClient } from "../db/client.js";
import {
  batches,
  loadingManifestLines,
  loadingManifests,
  productGrades,
  purchaseDocumentLines,
  purchaseDocuments,
  tripBatchSales,
  tripBatchShipments,
  tripBatchShortages,
  trips,
  warehouses,
} from "../db/schema.js";

export const adminDashboardSummaryQuerySchema = z.object({
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type AdminDashboardSummaryQuery = z.infer<typeof adminDashboardSummaryQuerySchema>;

function gramsToKg(grams: bigint | number | null | undefined): number {
  if (grams == null) {
    return 0;
  }
  return Number(grams) / 1000;
}

export async function getAdminDashboardSummary(db: DbClient, query: AdminDashboardSummaryQuery) {
  const since = query.since?.trim();
  const sinceDate = since ? new Date(`${since}T00:00:00.000Z`) : null;

  const tripPeriod =
    sinceDate != null ? sql`${trips.departedAt} >= ${sinceDate}` : undefined;

  const openTripWhere = tripPeriod ? and(eq(trips.status, "open"), tripPeriod) : eq(trips.status, "open");
  const allTripWhere = tripPeriod ?? undefined;

  const [tripCounts] = await db
    .select({
      openCount: sql<number>`count(*) filter (where ${trips.status} = 'open')::int`,
      closedCount: sql<number>`count(*) filter (where ${trips.status} = 'closed')::int`,
    })
    .from(trips)
    .where(allTripWhere);

  const [[shippedRow], [soldRow], [shortageRow]] = await Promise.all([
    db
      .select({ grams: sql<bigint>`coalesce(sum(${tripBatchShipments.grams}), 0)` })
      .from(tripBatchShipments)
      .innerJoin(trips, eq(trips.id, tripBatchShipments.tripId))
      .where(openTripWhere),
    db
      .select({ grams: sql<bigint>`coalesce(sum(${tripBatchSales.grams}), 0)` })
      .from(tripBatchSales)
      .innerJoin(trips, eq(trips.id, tripBatchSales.tripId))
      .where(openTripWhere),
    db
      .select({ grams: sql<bigint>`coalesce(sum(${tripBatchShortages.grams}), 0)` })
      .from(tripBatchShortages)
      .innerJoin(trips, eq(trips.id, tripBatchShortages.tripId))
      .where(openTripWhere),
  ]);

  const shippedKg = gramsToKg(shippedRow?.grams ?? 0n);
  const soldKg = gramsToKg(soldRow?.grams ?? 0n);
  const shortageKg = gramsToKg(shortageRow?.grams ?? 0n);
  const remainingInTripKg = Math.max(0, shippedKg - soldKg - shortageKg);

  const warehouseRows = await db
    .select({
      warehouseId: purchaseDocuments.warehouseId,
      warehouseName: warehouses.name,
      grams: sql<bigint>`coalesce(sum(${batches.onWarehouseGrams}), 0)`,
    })
    .from(batches)
    .innerJoin(purchaseDocumentLines, eq(purchaseDocumentLines.batchId, batches.id))
    .innerJoin(purchaseDocuments, eq(purchaseDocuments.id, purchaseDocumentLines.documentId))
    .innerJoin(warehouses, eq(warehouses.id, purchaseDocuments.warehouseId))
    .where(gt(batches.onWarehouseGrams, 0n))
    .groupBy(purchaseDocuments.warehouseId, warehouses.name);

  const productRows = await db
    .select({
      productGroup: productGrades.productGroup,
      grams: sql<bigint>`coalesce(sum(${batches.onWarehouseGrams} + ${batches.inTransitGrams} + ${batches.pendingInboundGrams}), 0)`,
    })
    .from(batches)
    .innerJoin(purchaseDocumentLines, eq(purchaseDocumentLines.batchId, batches.id))
    .innerJoin(productGrades, eq(productGrades.id, purchaseDocumentLines.productGradeId))
    .where(
      or(
        gt(batches.onWarehouseGrams, 0n),
        gt(batches.inTransitGrams, 0n),
        gt(batches.pendingInboundGrams, 0n),
      ),
    )
    .groupBy(productGrades.productGroup);

  const [batchCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(batches)
    .where(
      or(
        gt(batches.onWarehouseGrams, 0n),
        gt(batches.inTransitGrams, 0n),
        gt(batches.pendingInboundGrams, 0n),
      ),
    );

  const manifestWhere = and(
    or(isNull(loadingManifests.tripId), isNull(trips.status), ne(trips.status, "closed")),
    sinceDate != null ? sql`${loadingManifests.docDate} >= ${sinceDate}` : undefined,
  );

  const [manifestStats] = await db
    .select({
      count: sql<number>`count(distinct ${loadingManifests.id})::int`,
      withoutTrip: sql<number>`count(distinct ${loadingManifests.id}) filter (where ${loadingManifests.tripId} is null)::int`,
      sumGrams: sql<bigint>`coalesce(sum(${loadingManifestLines.grams}), 0)`,
    })
    .from(loadingManifests)
    .leftJoin(trips, eq(loadingManifests.tripId, trips.id))
    .leftJoin(loadingManifestLines, eq(loadingManifestLines.manifestId, loadingManifests.id))
    .where(manifestWhere);

  let warehouseKg = 0;
  const byWarehouseKg: Record<string, number> = {};
  for (const row of warehouseRows) {
    const kg = gramsToKg(row.grams);
    warehouseKg += kg;
    const label = row.warehouseName?.trim() || row.warehouseId;
    byWarehouseKg[label] = (byWarehouseKg[label] ?? 0) + kg;
  }

  const byProductGroupKg: Record<string, number> = {};
  for (const row of productRows) {
    const g = row.productGroup?.trim() || "Без вида";
    byProductGroupKg[g] = gramsToKg(row.grams);
  }

  return {
    trips: {
      openCount: tripCounts?.openCount ?? 0,
      closedCount: tripCounts?.closedCount ?? 0,
      shippedKg,
      soldKg,
      remainingInTripKg,
    },
    warehouse: {
      warehouseKg,
      batchCount: batchCountRow?.count ?? 0,
      byWarehouseKg,
      byProductGroupKg,
    },
    loadingManifests: {
      activeCount: manifestStats?.count ?? 0,
      withoutTripCount: manifestStats?.withoutTrip ?? 0,
      activeKg: gramsToKg(manifestStats?.sumGrams ?? 0n),
    },
  };
}
