import { TripNotFoundError } from "../errors.js";
import { loadBatchOrThrow } from "../load-batch.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../ports/trip-shortage-repository.port.js";

import { computeTripFinancials } from "./trip-financials.js";

export class GetTripReportUseCase {
  constructor(
    private readonly trips: TripRepository,
    private readonly shipments: TripShipmentRepository,
    private readonly sales: TripSaleRepository,
    private readonly shortages: TripShortageRepository,
    private readonly batches: BatchRepository,
  ) {}

  async execute(tripId: string) {
    const trip = await this.trips.findById(tripId);
    if (!trip) {
      throw new TripNotFoundError(tripId);
    }
    const shipment = await this.shipments.aggregateByTripId(tripId);
    const sales = await this.sales.aggregateByTripId(tripId);
    const shortage = await this.shortages.aggregateByTripId(tripId);

    const batchIds = new Set<string>();
    for (const l of sales.byBatch) {
      batchIds.add(l.batchId);
    }
    for (const l of shortage.byBatch) {
      batchIds.add(l.batchId);
    }
    const purchaseRubPerKgByBatchId = new Map<string, number>();
    for (const id of batchIds) {
      const batch = await loadBatchOrThrow(this.batches, id);
      purchaseRubPerKgByBatchId.set(id, batch.getPricePerKg());
    }
    const financials = computeTripFinancials(sales, shortage, purchaseRubPerKgByBatchId);

    return { trip, shipment, sales, shortage, financials };
  }
}
