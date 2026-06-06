import { eq } from "drizzle-orm";

import type { DbClient } from "../../db/client.js";
import { batches, loadingManifests, tripBatchShipments } from "../../db/schema.js";
import { TripNotFoundError, TripSellerCrossWarehouseLoadingError } from "../errors.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import { evaluateTripSellerLoadingFromWarehouse } from "./trip-seller-loading-guard.js";

export async function listTripLinkedWarehouseIds(db: DbClient, tripId: string): Promise<string[]> {
  const [manifestRows, shipmentRows] = await Promise.all([
    db
      .select({ warehouseId: loadingManifests.warehouseId })
      .from(loadingManifests)
      .where(eq(loadingManifests.tripId, tripId)),
    db
      .select({ warehouseId: batches.warehouseId })
      .from(tripBatchShipments)
      .innerJoin(batches, eq(tripBatchShipments.batchId, batches.id))
      .where(eq(tripBatchShipments.tripId, tripId)),
  ]);
  return [...new Set([...manifestRows, ...shipmentRows].map((row) => row.warehouseId))];
}

export async function assertTripAllowsWarehouseLoading(
  db: DbClient,
  trips: TripRepository,
  input: { tripId: string; warehouseId: string },
): Promise<void> {
  const trip = await trips.findById(input.tripId);
  if (!trip) {
    throw new TripNotFoundError(input.tripId);
  }
  const linked = await listTripLinkedWarehouseIds(db, input.tripId);
  const decision = evaluateTripSellerLoadingFromWarehouse({
    assignedSellerUserId: trip.getAssignedSellerUserId(),
    warehouseId: input.warehouseId,
    tripLinkedWarehouseIds: linked,
  });
  if (!decision.allowed) {
    throw new TripSellerCrossWarehouseLoadingError(input.tripId, input.warehouseId);
  }
}
