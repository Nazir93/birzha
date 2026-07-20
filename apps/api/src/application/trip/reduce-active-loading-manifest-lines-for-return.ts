import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import type { DbClient } from "../../db/client.js";
import {
  loadingManifestLines,
  loadingManifests,
  tripBatchSales,
  tripBatchShipments,
  tripBatchShortages,
  trips,
} from "../../db/schema.js";
import { LoadingManifestReturnAdjustForbiddenError } from "../errors.js";
import { DrizzleBatchRepository } from "../../infrastructure/persistence/drizzle-batch.repository.js";
import { DrizzleTripShipmentRepository } from "../../infrastructure/persistence/drizzle-trip-shipment.repository.js";
import { gramsToKg } from "../units/mass.js";
import { loadBatchOrThrow } from "../load-batch.js";
import { planLoadingManifestLinesReduceForReturn } from "./plan-loading-manifest-lines-reduce-for-return.js";

/** ПН «в работе»: без рейса или рейс не закрыт. */
function activeManifestScopeWhere() {
  return or(
    sql`${loadingManifests.tripId} IS NULL`,
    sql`${trips.status} IS NULL`,
    sql`${trips.status} <> 'closed'`,
  )!;
}

/**
 * После записи в журнал возврата: уменьшить/убрать строки активных ПН по партии
 * и при необходимости вернуть отгруженную массу с открытого рейса на склад.
 */
export async function reduceActiveLoadingManifestLinesForBatchReturn(
  db: DbClient,
  input: { batchId: string; returnGrams: bigint },
): Promise<void> {
  if (input.returnGrams <= 0n) {
    return;
  }

  const lineRows = await db
    .select({
      manifestId: loadingManifestLines.manifestId,
      batchId: loadingManifestLines.batchId,
      lineNo: loadingManifestLines.lineNo,
      grams: loadingManifestLines.grams,
      packageCount: loadingManifestLines.packageCount,
      tripId: loadingManifests.tripId,
    })
    .from(loadingManifestLines)
    .innerJoin(loadingManifests, eq(loadingManifests.id, loadingManifestLines.manifestId))
    .leftJoin(trips, eq(loadingManifests.tripId, trips.id))
    .where(and(eq(loadingManifestLines.batchId, input.batchId), activeManifestScopeWhere()))
    .orderBy(desc(loadingManifests.createdAt), desc(loadingManifestLines.lineNo));

  if (lineRows.length === 0) {
    return;
  }

  const tripIds = [
    ...new Set(lineRows.map((r) => r.tripId).filter((id): id is string => Boolean(id?.trim()))),
  ];

  const shipmentByTrip = new Map<string, bigint>();
  const soldByTrip = new Map<string, bigint>();
  const shortageByTrip = new Map<string, bigint>();

  if (tripIds.length > 0) {
    const shipmentRows = await db
      .select({
        tripId: tripBatchShipments.tripId,
        total: sql<bigint>`coalesce(sum(${tripBatchShipments.grams}), 0::bigint)`,
      })
      .from(tripBatchShipments)
      .where(
        and(
          eq(tripBatchShipments.batchId, input.batchId),
          inArray(tripBatchShipments.tripId, tripIds),
        ),
      )
      .groupBy(tripBatchShipments.tripId);
    for (const row of shipmentRows) {
      shipmentByTrip.set(row.tripId, row.total);
    }

    const soldRows = await db
      .select({
        tripId: tripBatchSales.tripId,
        total: sql<bigint>`coalesce(sum(${tripBatchSales.grams}), 0::bigint)`,
      })
      .from(tripBatchSales)
      .where(and(eq(tripBatchSales.batchId, input.batchId), inArray(tripBatchSales.tripId, tripIds)))
      .groupBy(tripBatchSales.tripId);
    for (const row of soldRows) {
      soldByTrip.set(row.tripId, row.total);
    }

    const shortageRows = await db
      .select({
        tripId: tripBatchShortages.tripId,
        total: sql<bigint>`coalesce(sum(${tripBatchShortages.grams}), 0::bigint)`,
      })
      .from(tripBatchShortages)
      .where(
        and(
          eq(tripBatchShortages.batchId, input.batchId),
          inArray(tripBatchShortages.tripId, tripIds),
        ),
      )
      .groupBy(tripBatchShortages.tripId);
    for (const row of shortageRows) {
      shortageByTrip.set(row.tripId, row.total);
    }
  }

  for (const tripId of tripIds) {
    const sold = soldByTrip.get(tripId) ?? 0n;
    const shortage = shortageByTrip.get(tripId) ?? 0n;
    if (sold > 0n || shortage > 0n) {
      throw new LoadingManifestReturnAdjustForbiddenError(
        input.batchId,
        "sales_or_shortage",
        "По рейсу уже есть продажи или недостачи по этой партии — возврат на склад недоступен. Сначала отмените операции по рейсу.",
      );
    }
  }

  const plan = planLoadingManifestLinesReduceForReturn({
    returnGrams: input.returnGrams,
    lines: lineRows.map((r) => ({
      manifestId: r.manifestId,
      batchId: r.batchId,
      lineNo: r.lineNo,
      grams: r.grams,
      packageCount: r.packageCount,
      tripId: r.tripId,
      shipmentGramsOnTrip: r.tripId ? (shipmentByTrip.get(r.tripId) ?? 0n) : 0n,
    })),
  });

  if (plan.length === 0) {
    return;
  }

  const batchRepo = new DrizzleBatchRepository(db);
  const shipRepo = new DrizzleTripShipmentRepository(db);
  /** После частичного unship уменьшаем доступный shipment для следующих строк того же рейса. */
  const remainingShipmentByTrip = new Map(shipmentByTrip);

  for (const step of plan) {
    if (step.unshipGrams > 0n && step.tripId) {
      const left = remainingShipmentByTrip.get(step.tripId) ?? 0n;
      const unship = step.unshipGrams < left ? step.unshipGrams : left;
      if (unship > 0n) {
        const batch = await loadBatchOrThrow(batchRepo, step.batchId);
        batch.receiveBack(gramsToKg(unship), "warehouse_return_adjust_loading_manifest");
        await batchRepo.save(batch);
        await shipRepo.reduceForTripAndBatch(
          step.tripId,
          step.batchId,
          unship,
          step.unshipPackageCount,
        );
        remainingShipmentByTrip.set(step.tripId, left - unship);
      }
    }

    if (step.newGrams <= 0n) {
      await db
        .delete(loadingManifestLines)
        .where(
          and(
            eq(loadingManifestLines.manifestId, step.manifestId),
            eq(loadingManifestLines.batchId, step.batchId),
            eq(loadingManifestLines.lineNo, step.lineNo),
          ),
        );
    } else {
      await db
        .update(loadingManifestLines)
        .set({ grams: step.newGrams, packageCount: step.newPackageCount })
        .where(
          and(
            eq(loadingManifestLines.manifestId, step.manifestId),
            eq(loadingManifestLines.batchId, step.batchId),
            eq(loadingManifestLines.lineNo, step.lineNo),
          ),
        );
    }
  }
}
