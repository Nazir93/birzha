import type { Trip } from "@birzha/domain";

import type { DbClient } from "../../db/client.js";
import { TripNotFoundError } from "../errors.js";
import type { TripRepository } from "../ports/trip-repository.port.js";

/** Проверяет, что рейс существует (погрузка с любого склада разрешена). */
export async function assertTripAllowsWarehouseLoading(
  _db: DbClient,
  trips: TripRepository,
  input: { tripId: string; warehouseId: string },
): Promise<Trip> {
  const trip = await trips.findById(input.tripId);
  if (!trip) {
    throw new TripNotFoundError(input.tripId);
  }
  return trip;
}
