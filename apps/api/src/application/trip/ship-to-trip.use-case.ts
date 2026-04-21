import { randomUUID } from "node:crypto";

import { TripClosedError, TripNotFoundError } from "../errors.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripShipmentRepository } from "../ports/trip-shipment-repository.port.js";
import { loadBatchOrThrow } from "../load-batch.js";
import { kgToGrams } from "../units/kg-grams.js";

export type ShipToTripInput = {
  batchId: string;
  kg: number;
  tripId: string;
  /** Ящики по этой строке отгрузки (опционально). */
  packageCount?: number;
};

/** Обёртка транзакции PostgreSQL: одна пара репозиториев на `tx` для save + append. */
export type ShipToTripTransactionRunner = (
  fn: (batches: BatchRepository, shipments: TripShipmentRepository) => Promise<void>,
) => Promise<void>;

export class ShipToTripUseCase {
  constructor(
    private readonly batches: BatchRepository,
    private readonly trips: TripRepository,
    private readonly shipments: TripShipmentRepository,
    private readonly runShipInTransaction?: ShipToTripTransactionRunner,
  ) {}

  async execute(input: ShipToTripInput): Promise<void> {
    const trip = await this.trips.findById(input.tripId);
    if (!trip) {
      throw new TripNotFoundError(input.tripId);
    }
    if (!trip.canAcceptShipments()) {
      throw new TripClosedError(input.tripId);
    }

    const grams = kgToGrams(input.kg);
    const shipmentId = randomUUID();
    const packageCount: bigint | null =
      input.packageCount === undefined ? null : BigInt(Math.max(0, Math.floor(input.packageCount)));

    const persist = async (batches: BatchRepository, shipments: TripShipmentRepository) => {
      const batch = await loadBatchOrThrow(batches, input.batchId);
      batch.shipToTrip(input.kg, input.tripId);
      await batches.save(batch);
      await shipments.append({
        id: shipmentId,
        tripId: input.tripId,
        batchId: input.batchId,
        grams,
        packageCount,
      });
    };

    if (this.runShipInTransaction) {
      await this.runShipInTransaction(persist);
    } else {
      await persist(this.batches, this.shipments);
    }
  }
}
