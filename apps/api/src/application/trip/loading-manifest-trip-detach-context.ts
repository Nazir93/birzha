import { and, eq, inArray, sql } from "drizzle-orm";

import type { DbClient } from "../../db/client.js";
import {
  batches,
  loadingManifestLines,
  loadingManifests,
  tripBatchSales,
  tripBatchShipments,
  tripBatchShortages,
  trips,
} from "../../db/schema.js";
import {
  loadingManifestTripDetachable,
  loadingManifestTripDetachLockMessage,
  type LoadingManifestTripDetachLockCode,
} from "./loading-manifest-trip-detachable.js";
import type { ManifestBatchGrams } from "./loading-manifest-unship-from-trip.js";
import { unshipLoadingManifestBatchesFromTrip } from "./loading-manifest-unship-from-trip.js";
import { DrizzleBatchRepository } from "../../infrastructure/persistence/drizzle-batch.repository.js";
import { DrizzleTripShipmentRepository } from "../../infrastructure/persistence/drizzle-trip-shipment.repository.js";
import {
  LoadingManifestNotFoundError,
  LoadingManifestTripDetachForbiddenError,
  TripNotFoundError,
} from "../errors.js";

export type LoadingManifestTripDetachState = {
  tripDetachLocked: boolean;
  tripDetachLockedReason: LoadingManifestTripDetachLockCode | null;
};

export type LoadingManifestTripLinkContext = {
  tripId: string;
  tripStatus: "open" | "closed";
  manifestGramsByBatch: Map<string, ManifestBatchGrams>;
  shipmentByBatch: Map<string, bigint>;
  detachState: LoadingManifestTripDetachState;
};

async function loadBatchMaps(
  db: DbClient,
  manifestId: string,
  linkedTripId: string,
): Promise<{
  manifestGramsByBatch: Map<string, ManifestBatchGrams>;
  shipmentByBatch: Map<string, bigint>;
  soldByBatch: Map<string, bigint>;
  shortageByBatch: Map<string, bigint>;
  inTransitByBatch: Map<string, bigint>;
}> {
  const lineRows = await db
    .select({
      batchId: loadingManifestLines.batchId,
      grams: loadingManifestLines.grams,
      packageCount: loadingManifestLines.packageCount,
      inTransitGrams: batches.inTransitGrams,
    })
    .from(loadingManifestLines)
    .leftJoin(batches, eq(loadingManifestLines.batchId, batches.id))
    .where(eq(loadingManifestLines.manifestId, manifestId));

  const batchIds = [...new Set(lineRows.map((r) => r.batchId))];
  const shipmentByBatch = new Map<string, bigint>();
  const soldByBatch = new Map<string, bigint>();
  const shortageByBatch = new Map<string, bigint>();

  if (batchIds.length > 0) {
    const shipmentRows = await db
      .select({
        batchId: tripBatchShipments.batchId,
        total: sql<bigint>`coalesce(sum(${tripBatchShipments.grams}), 0::bigint)`,
      })
      .from(tripBatchShipments)
      .where(and(eq(tripBatchShipments.tripId, linkedTripId), inArray(tripBatchShipments.batchId, batchIds)))
      .groupBy(tripBatchShipments.batchId);
    for (const row of shipmentRows) {
      shipmentByBatch.set(row.batchId, row.total);
    }

    const soldRows = await db
      .select({
        batchId: tripBatchSales.batchId,
        total: sql<bigint>`coalesce(sum(${tripBatchSales.grams}), 0::bigint)`,
      })
      .from(tripBatchSales)
      .where(and(eq(tripBatchSales.tripId, linkedTripId), inArray(tripBatchSales.batchId, batchIds)))
      .groupBy(tripBatchSales.batchId);
    for (const row of soldRows) {
      soldByBatch.set(row.batchId, row.total);
    }

    const shortageRows = await db
      .select({
        batchId: tripBatchShortages.batchId,
        total: sql<bigint>`coalesce(sum(${tripBatchShortages.grams}), 0::bigint)`,
      })
      .from(tripBatchShortages)
      .where(and(eq(tripBatchShortages.tripId, linkedTripId), inArray(tripBatchShortages.batchId, batchIds)))
      .groupBy(tripBatchShortages.batchId);
    for (const row of shortageRows) {
      shortageByBatch.set(row.batchId, row.total);
    }
  }

  const manifestGramsByBatch = new Map<string, ManifestBatchGrams>();
  const inTransitByBatch = new Map<string, bigint>();
  for (const line of lineRows) {
    const prev = manifestGramsByBatch.get(line.batchId) ?? { grams: 0n, packageCount: null };
    const pkg = line.packageCount ?? null;
    manifestGramsByBatch.set(line.batchId, {
      grams: prev.grams + line.grams,
      packageCount:
        prev.packageCount == null && pkg == null ? null : (prev.packageCount ?? 0n) + (pkg ?? 0n),
    });
    inTransitByBatch.set(line.batchId, line.inTransitGrams ?? 0n);
  }

  return { manifestGramsByBatch, shipmentByBatch, soldByBatch, shortageByBatch, inTransitByBatch };
}

function buildDetachState(
  linkedTripId: string,
  tripStatus: "open" | "closed" | null,
  manifestGramsByBatch: Map<string, ManifestBatchGrams>,
  shipmentByBatch: Map<string, bigint>,
  soldByBatch: Map<string, bigint>,
  shortageByBatch: Map<string, bigint>,
  inTransitByBatch: Map<string, bigint>,
): LoadingManifestTripDetachState {
  const check = loadingManifestTripDetachable({
    tripId: linkedTripId,
    tripStatus: tripStatus === "closed" ? "closed" : "open",
    batches: [...manifestGramsByBatch.entries()].map(([batchId, manifest]) => ({
      manifestGrams: manifest.grams,
      shipmentGramsOnTrip: shipmentByBatch.get(batchId) ?? 0n,
      inTransitGrams: inTransitByBatch.get(batchId) ?? 0n,
      soldGramsOnTrip: soldByBatch.get(batchId) ?? 0n,
      shortageGramsOnTrip: shortageByBatch.get(batchId) ?? 0n,
    })),
  });
  if (check.detachable) {
    return { tripDetachLocked: false, tripDetachLockedReason: null };
  }
  return { tripDetachLocked: true, tripDetachLockedReason: check.code };
}

export async function loadLoadingManifestTripDetachState(
  db: DbClient,
  manifestId: string,
  tripId: string | null,
): Promise<LoadingManifestTripDetachState> {
  const linkedTripId = tripId?.trim() ?? "";
  if (linkedTripId.length === 0) {
    return { tripDetachLocked: true, tripDetachLockedReason: "not_linked" };
  }

  const [tripRow] = await db
    .select({ status: trips.status })
    .from(trips)
    .where(eq(trips.id, linkedTripId))
    .limit(1);

  const maps = await loadBatchMaps(db, manifestId, linkedTripId);
  return buildDetachState(
    linkedTripId,
    tripRow?.status === "closed" ? "closed" : "open",
    maps.manifestGramsByBatch,
    maps.shipmentByBatch,
    maps.soldByBatch,
    maps.shortageByBatch,
    maps.inTransitByBatch,
  );
}

export async function loadLoadingManifestTripLinkContext(
  db: DbClient,
  manifestId: string,
): Promise<LoadingManifestTripLinkContext | null> {
  const [manifestRow] = await db
    .select({ tripId: loadingManifests.tripId })
    .from(loadingManifests)
    .where(eq(loadingManifests.id, manifestId))
    .limit(1);
  if (!manifestRow) {
    return null;
  }
  const tripId = manifestRow.tripId?.trim() ?? "";
  if (tripId.length === 0) {
    return null;
  }

  const [tripRow] = await db
    .select({ status: trips.status })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!tripRow) {
    throw new TripNotFoundError(tripId);
  }

  const maps = await loadBatchMaps(db, manifestId, tripId);
  const detachState = buildDetachState(
    tripId,
    tripRow.status === "closed" ? "closed" : "open",
    maps.manifestGramsByBatch,
    maps.shipmentByBatch,
    maps.soldByBatch,
    maps.shortageByBatch,
    maps.inTransitByBatch,
  );

  return {
    tripId,
    tripStatus: tripRow.status === "closed" ? "closed" : "open",
    manifestGramsByBatch: maps.manifestGramsByBatch,
    shipmentByBatch: maps.shipmentByBatch,
    detachState,
  };
}

export async function unshipManifestFromLinkedTrip(
  db: DbClient,
  manifestId: string,
  link: LoadingManifestTripLinkContext,
): Promise<void> {
  if (link.detachState.tripDetachLocked || link.detachState.tripDetachLockedReason) {
    const code = link.detachState.tripDetachLockedReason ?? "shipment_mismatch";
    throw new LoadingManifestTripDetachForbiddenError(
      manifestId,
      code,
      loadingManifestTripDetachLockMessage(code),
    );
  }

  const batchRepo = new DrizzleBatchRepository(db);
  const shipRepo = new DrizzleTripShipmentRepository(db);
  await unshipLoadingManifestBatchesFromTrip({
    tripId: link.tripId,
    manifestGramsByBatch: link.manifestGramsByBatch,
    shipmentGramsByBatch: link.shipmentByBatch,
    batches: batchRepo,
    shipments: shipRepo,
    reason: "detach loading manifest from trip",
  });
}

export async function detachManifestTripId(db: DbClient, manifestId: string): Promise<void> {
  const link = await loadLoadingManifestTripLinkContext(db, manifestId);
  if (!link) {
    throw new LoadingManifestTripDetachForbiddenError(
      manifestId,
      "not_linked",
      loadingManifestTripDetachLockMessage("not_linked"),
    );
  }
  await db.transaction(async (tx) => {
    const exec = tx as unknown as DbClient;
    const linkCtx = await loadLoadingManifestTripLinkContext(exec, manifestId);
    if (!linkCtx) {
      throw new LoadingManifestTripDetachForbiddenError(
        manifestId,
        "not_linked",
        loadingManifestTripDetachLockMessage("not_linked"),
      );
    }
    await unshipManifestFromLinkedTrip(exec, manifestId, linkCtx);
    await exec.update(loadingManifests).set({ tripId: null }).where(eq(loadingManifests.id, manifestId));
  });
}

/** Для use-case: проверка существования накладной. */
export async function manifestExists(db: DbClient, manifestId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: loadingManifests.id })
    .from(loadingManifests)
    .where(eq(loadingManifests.id, manifestId))
    .limit(1);
  return row != null;
}

export async function assertManifestExists(db: DbClient, manifestId: string): Promise<void> {
  if (!(await manifestExists(db, manifestId))) {
    throw new LoadingManifestNotFoundError(manifestId);
  }
}
