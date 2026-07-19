import { tripDestinationMatchesManifest } from "@birzha/domain";
import type { Trip } from "@birzha/domain";

import type { DbClient } from "../../db/client.js";
import { LoadingManifestTripDestinationMismatchError, TripNotFoundError } from "../errors.js";
import type { TripRepository } from "../ports/trip-repository.port.js";

/** Проверяет, что рейс существует (погрузка с любого склада разрешена). */
export async function assertTripAllowsWarehouseLoading(
  _db: DbClient,
  trips: TripRepository,
  input: {
    tripId: string;
    warehouseId: string;
    /** Если задан — город рейса должен совпадать с городом ПН. */
    manifestId?: string;
    manifestDestinationCode?: string;
  },
): Promise<Trip> {
  const trip = await trips.findById(input.tripId);
  if (!trip) {
    throw new TripNotFoundError(input.tripId);
  }
  const tripDest = trip.getDestinationCode();
  const manifestDest = input.manifestDestinationCode;
  if (
    manifestDest != null &&
    input.manifestId != null &&
    !tripDestinationMatchesManifest(tripDest, manifestDest)
  ) {
    throw new LoadingManifestTripDestinationMismatchError({
      manifestId: input.manifestId,
      tripId: input.tripId,
      tripDestinationCode: (tripDest ?? "").trim(),
      manifestDestinationCode: manifestDest,
    });
  }
  return trip;
}
