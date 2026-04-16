import { randomUUID } from "node:crypto";

import { TripNotFoundError, TripShortageExceedsNetError } from "../errors.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../ports/trip-shortage-repository.port.js";
import { loadBatchOrThrow } from "../load-batch.js";
import { kgToGrams } from "../units/kg-grams.js";

export type RecordTripShortageInput = {
  batchId: string;
  tripId: string;
  kg: number;
  reason: string;
};

export type RecordTripShortageTransactionRunner = (
  fn: (batches: BatchRepository, shortages: TripShortageRepository) => Promise<void>,
) => Promise<void>;

export class RecordTripShortageUseCase {
  constructor(
    private readonly batches: BatchRepository,
    private readonly trips: TripRepository,
    private readonly shipments: TripShipmentRepository,
    private readonly sales: TripSaleRepository,
    private readonly shortages: TripShortageRepository,
    private readonly runInTransaction?: RecordTripShortageTransactionRunner,
  ) {}

  async execute(input: RecordTripShortageInput): Promise<void> {
    const trip = await this.trips.findById(input.tripId);
    if (!trip) {
      throw new TripNotFoundError(input.tripId);
    }

    const shipped = await this.shipments.totalGramsForTripAndBatch(input.tripId, input.batchId);
    const sold = await this.sales.totalGramsForTripAndBatch(input.tripId, input.batchId);
    const priorShort = await this.shortages.totalGramsForTripAndBatch(input.tripId, input.batchId);
    const netAvailable = shipped - sold - priorShort;

    const requested = kgToGrams(input.kg);
    if (requested > netAvailable) {
      throw new TripShortageExceedsNetError(input.tripId, input.batchId, netAvailable, requested);
    }

    const lineId = randomUUID();
    const reason = input.reason.trim();

    const persist = async (batches: BatchRepository, shortageRepo: TripShortageRepository) => {
      const batch = await loadBatchOrThrow(batches, input.batchId);
      batch.writeOffFromTransit(input.kg, reason);
      await batches.save(batch);
      await shortageRepo.append({
        id: lineId,
        tripId: input.tripId,
        batchId: input.batchId,
        grams: requested,
        reason,
      });
    };

    if (this.runInTransaction) {
      await this.runInTransaction(persist);
    } else {
      await persist(this.batches, this.shortages);
    }
  }
}
