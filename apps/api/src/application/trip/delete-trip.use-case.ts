import { TripNotEmptyError, TripNotFoundError } from "../errors.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../ports/trip-shortage-repository.port.js";

export class DeleteTripUseCase {
  constructor(
    private readonly trips: TripRepository,
    private readonly shipments: TripShipmentRepository,
    private readonly sales: TripSaleRepository,
    private readonly shortages: TripShortageRepository,
  ) {}

  async execute(tripId: string): Promise<void> {
    const trip = await this.trips.findById(tripId);
    if (!trip) {
      throw new TripNotFoundError(tripId);
    }
    const [sh, sl, shrt] = await Promise.all([
      this.shipments.aggregateByTripId(tripId),
      this.sales.aggregateByTripId(tripId),
      this.shortages.aggregateByTripId(tripId),
    ]);
    if (sh.totalGrams > 0n || sl.totalGrams > 0n || shrt.totalGrams > 0n) {
      throw new TripNotEmptyError(tripId);
    }
    await this.trips.deleteById(tripId);
  }
}
