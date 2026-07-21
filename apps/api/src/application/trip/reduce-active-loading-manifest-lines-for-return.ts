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

function asGrams(value: bigint | string | number | null | undefined): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    return BigInt(value.trim());
  }
  return 0n;
}

/**
 * После записи в журнал возврата: уменьшить/убрать строки активных ПН по партии
 * и вернуть отгруженную массу с открытого рейса на склад (в т.ч. если строк ПН уже нет).
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
        total: sql<string>`coalesce(sum(${tripBatchShipments.grams}), 0)::text`,
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
      shipmentByTrip.set(row.tripId, asGrams(row.total));
    }

    const soldRows = await db
      .select({
        tripId: tripBatchSales.tripId,
        total: sql<string>`coalesce(sum(${tripBatchSales.grams}), 0)::text`,
      })
      .from(tripBatchSales)
      .where(and(eq(tripBatchSales.batchId, input.batchId), inArray(tripBatchSales.tripId, tripIds)))
      .groupBy(tripBatchSales.tripId);
    for (const row of soldRows) {
      soldByTrip.set(row.tripId, asGrams(row.total));
    }

    const shortageRows = await db
      .select({
        tripId: tripBatchShortages.tripId,
        total: sql<string>`coalesce(sum(${tripBatchShortages.grams}), 0)::text`,
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
      shortageByTrip.set(row.tripId, asGrams(row.total));
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
      grams: asGrams(r.grams),
      packageCount: r.packageCount == null ? null : asGrams(r.packageCount),
      tripId: r.tripId,
      shipmentGramsOnTrip: r.tripId ? (shipmentByTrip.get(r.tripId) ?? 0n) : 0n,
    })),
  });

  const batchRepo = new DrizzleBatchRepository(db);
  const shipRepo = new DrizzleTripShipmentRepository(db);
  const remainingShipmentByTrip = new Map(shipmentByTrip);
  let unshippedTotal = 0n;

  for (const step of plan) {
    if (step.unshipGrams > 0n && step.tripId) {
      const left = remainingShipmentByTrip.get(step.tripId) ?? 0n;
      const unship = step.unshipGrams < left ? step.unshipGrams : left;
      if (unship > 0n) {
        const batch = await loadBatchOrThrow(batchRepo, step.batchId);
        const inTransit = batch.toPersistenceState().inTransitGrams;
        const canReceive = unship < inTransit ? unship : inTransit;
        if (canReceive > 0n) {
          batch.receiveBack(gramsToKg(canReceive), "warehouse_return_adjust_loading_manifest");
          await batchRepo.save(batch);
          unshippedTotal += canReceive;
        }
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

  // Если строк ПН не было (или unship не покрыл возврат) — добираем с открытых рейсов по отгрузкам.
  let stillNeed = input.returnGrams - unshippedTotal;
  if (stillNeed <= 0n) {
    return;
  }

  const openShipmentRows = await db
    .select({
      tripId: tripBatchShipments.tripId,
      grams: tripBatchShipments.grams,
      id: tripBatchShipments.id,
      packageCount: tripBatchShipments.packageCount,
    })
    .from(tripBatchShipments)
    .innerJoin(trips, eq(trips.id, tripBatchShipments.tripId))
    .where(and(eq(tripBatchShipments.batchId, input.batchId), sql`${trips.status} <> 'closed'`))
    .orderBy(desc(tripBatchShipments.id));

  if (openShipmentRows.length === 0) {
    return;
  }

  const openTripIds = [...new Set(openShipmentRows.map((r) => r.tripId))];
  for (const tripId of openTripIds) {
    const sold = await db
      .select({ total: sql<string>`coalesce(sum(${tripBatchSales.grams}), 0)::text` })
      .from(tripBatchSales)
      .where(and(eq(tripBatchSales.batchId, input.batchId), eq(tripBatchSales.tripId, tripId)));
    const shortage = await db
      .select({ total: sql<string>`coalesce(sum(${tripBatchShortages.grams}), 0)::text` })
      .from(tripBatchShortages)
      .where(and(eq(tripBatchShortages.batchId, input.batchId), eq(tripBatchShortages.tripId, tripId)));
    if (asGrams(sold[0]?.total) > 0n || asGrams(shortage[0]?.total) > 0n) {
      throw new LoadingManifestReturnAdjustForbiddenError(
        input.batchId,
        "sales_or_shortage",
        "По рейсу уже есть продажи или недостачи по этой партии — возврат на склад недоступен. Сначала отмените операции по рейсу.",
      );
    }
  }

  for (const tripId of openTripIds) {
    if (stillNeed <= 0n) {
      break;
    }
    const onTrip = openShipmentRows
      .filter((r) => r.tripId === tripId)
      .reduce((acc, r) => acc + asGrams(r.grams), 0n);
    if (onTrip <= 0n) {
      continue;
    }
    const unship = onTrip < stillNeed ? onTrip : stillNeed;
    const batch = await loadBatchOrThrow(batchRepo, input.batchId);
    const inTransit = batch.toPersistenceState().inTransitGrams;
    const canReceive = unship < inTransit ? unship : inTransit;
    if (canReceive > 0n) {
      batch.receiveBack(gramsToKg(canReceive), "warehouse_return_adjust_loading_manifest");
      await batchRepo.save(batch);
      stillNeed -= canReceive;
    }
    await shipRepo.reduceForTripAndBatch(tripId, input.batchId, unship, null);
  }
}
