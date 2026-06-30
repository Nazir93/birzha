import { and, eq, gt, gte, isNull, ne, or, sql } from "drizzle-orm";
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
import {
  gramsToKg,
  mapGradeStockRows,
  mapProductGroupStockRows,
  mapWarehouseStockRows,
} from "./admin-dashboard-summary-map.js";

export const adminDashboardSummaryQuerySchema = z.object({
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type AdminDashboardSummaryQuery = z.infer<typeof adminDashboardSummaryQuerySchema>;

const batchRemainingGrams = sql<bigint>`(${batches.onWarehouseGrams} + ${batches.inTransitGrams} + ${batches.pendingInboundGrams})`;

const batchWithRemainingWhere = or(
  gt(batches.onWarehouseGrams, 0n),
  gt(batches.inTransitGrams, 0n),
  gt(batches.pendingInboundGrams, 0n),
);

const batchPackageShareSum = sql<number>`coalesce(sum(
  case when ${batches.totalGrams} > 0 then
    ${batchRemainingGrams}::numeric / ${batches.totalGrams}::numeric * coalesce(${purchaseDocumentLines.packageCount}, 0)
  else 0 end
), 0)::float`;

const batchRemainingValueKopecks = sql<bigint>`coalesce(sum(
  (${batchRemainingGrams}::numeric * ${purchaseDocumentLines.pricePerKg} * 100 / 1000)::bigint
), 0)`;

export async function getAdminDashboardSummary(db: DbClient, query: AdminDashboardSummaryQuery) {
  const since = query.since?.trim();
  const sinceDate = since ? new Date(`${since}T00:00:00.000Z`) : null;

  const tripPeriod = sinceDate != null ? gte(trips.departedAt, sinceDate) : undefined;

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

  const [gradeRows, warehouseDetailRows, productGroupRows] = await Promise.all([
    db
      .select({
        productGradeId: productGrades.id,
        code: productGrades.code,
        displayName: productGrades.displayName,
        productGroup: productGrades.productGroup,
        grams: sql<bigint>`coalesce(sum(${batchRemainingGrams}), 0)`,
        packages: batchPackageShareSum,
        valueKopecks: batchRemainingValueKopecks,
      })
      .from(batches)
      .innerJoin(purchaseDocumentLines, eq(purchaseDocumentLines.batchId, batches.id))
      .innerJoin(productGrades, eq(productGrades.id, purchaseDocumentLines.productGradeId))
      .where(batchWithRemainingWhere)
      .groupBy(productGrades.id, productGrades.code, productGrades.displayName, productGrades.productGroup),
    db
      .select({
        warehouseId: purchaseDocuments.warehouseId,
        warehouseName: warehouses.name,
        grams: sql<bigint>`coalesce(sum(${batchRemainingGrams}), 0)`,
        packages: batchPackageShareSum,
        valueKopecks: batchRemainingValueKopecks,
      })
      .from(batches)
      .innerJoin(purchaseDocumentLines, eq(purchaseDocumentLines.batchId, batches.id))
      .innerJoin(purchaseDocuments, eq(purchaseDocuments.id, purchaseDocumentLines.documentId))
      .innerJoin(warehouses, eq(warehouses.id, purchaseDocuments.warehouseId))
      .where(batchWithRemainingWhere)
      .groupBy(purchaseDocuments.warehouseId, warehouses.name),
    db
      .select({
        productGroup: productGrades.productGroup,
        grams: sql<bigint>`coalesce(sum(${batchRemainingGrams}), 0)`,
        packages: batchPackageShareSum,
        valueKopecks: batchRemainingValueKopecks,
      })
      .from(batches)
      .innerJoin(purchaseDocumentLines, eq(purchaseDocumentLines.batchId, batches.id))
      .innerJoin(productGrades, eq(productGrades.id, purchaseDocumentLines.productGradeId))
      .where(batchWithRemainingWhere)
      .groupBy(productGrades.productGroup),
  ]);

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
    sinceDate != null ? gte(loadingManifests.docDate, sinceDate) : undefined,
  );

  const [manifestStats] = await db
    .select({
      count: sql<number>`count(distinct ${loadingManifests.id})::int`,
      withoutTrip: sql<number>`count(distinct ${loadingManifests.id}) filter (where ${loadingManifests.tripId} is null)::int`,
      sumGrams: sql<bigint>`coalesce(sum(${loadingManifestLines.grams}), 0)`,
      withoutTripGrams: sql<bigint>`coalesce(sum(${loadingManifestLines.grams}) filter (where ${loadingManifests.tripId} is null), 0)`,
    })
    .from(loadingManifests)
    .leftJoin(trips, eq(loadingManifests.tripId, trips.id))
    .leftJoin(loadingManifestLines, eq(loadingManifestLines.manifestId, loadingManifests.id))
    .where(manifestWhere);

  const [transitTotals] = await db
    .select({
      inTransitGrams: sql<bigint>`coalesce(sum(${batches.inTransitGrams}), 0)`,
      pendingInboundGrams: sql<bigint>`coalesce(sum(${batches.pendingInboundGrams}), 0)`,
    })
    .from(batches)
    .where(batchWithRemainingWhere);

  const [unassignedTrips] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(trips)
    .where(
      and(
        eq(trips.status, "open"),
        or(isNull(trips.assignedSellerUserId), eq(trips.assignedSellerUserId, "")),
      ),
    );

  let warehouseKg = 0;
  const byWarehouseKg: Record<string, number> = {};
  for (const row of warehouseRows) {
    const kg = gramsToKg(row.grams);
    warehouseKg += kg;
    const label = row.warehouseName?.trim() || row.warehouseId;
    byWarehouseKg[label] = (byWarehouseKg[label] ?? 0) + kg;
  }

  const byProductGroupKg: Record<string, number> = {};
  const { byGrade, stockTotals } = mapGradeStockRows(gradeRows);
  const byWarehouse = mapWarehouseStockRows(warehouseDetailRows);
  const { byProductGroup, byProductGroupKg: productGroupKgMap } = mapProductGroupStockRows(productGroupRows);
  Object.assign(byProductGroupKg, productGroupKgMap);

  return {
    trips: {
      openCount: tripCounts?.openCount ?? 0,
      closedCount: tripCounts?.closedCount ?? 0,
      shippedKg,
      soldKg,
      remainingInTripKg,
      shortageKg,
    },
    warehouse: {
      warehouseKg,
      batchCount: batchCountRow?.count ?? 0,
      inTransitKg: gramsToKg(transitTotals?.inTransitGrams ?? 0n),
      pendingInboundKg: gramsToKg(transitTotals?.pendingInboundGrams ?? 0n),
      byWarehouseKg,
      byProductGroupKg,
      stockTotals,
      byGrade,
      byWarehouse,
      byProductGroup,
    },
    loadingManifests: {
      activeCount: manifestStats?.count ?? 0,
      withoutTripCount: manifestStats?.withoutTrip ?? 0,
      withoutTripKg: gramsToKg(manifestStats?.withoutTripGrams ?? 0n),
      activeKg: gramsToKg(manifestStats?.sumGrams ?? 0n),
    },
    attention: {
      unassignedOpenTripsCount: unassignedTrips?.count ?? 0,
    },
  };
}
