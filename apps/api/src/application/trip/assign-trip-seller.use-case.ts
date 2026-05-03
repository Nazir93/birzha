import { TripClosedError, TripNotFoundError } from "../errors.js";
import type { TripRepository } from "../ports/trip-repository.port.js";

export class AssignTripSellerUseCase {
  constructor(private readonly trips: TripRepository) {}

  async execute(input: { tripId: string; sellerUserId: string }): Promise<void> {
    const trip = await this.trips.findById(input.tripId);
    if (!trip) {
      throw new TripNotFoundError(input.tripId);
    }
    if (!trip.canAcceptShipments()) {
      throw new TripClosedError(input.tripId);
    }
    trip.assignSeller(input.sellerUserId);
    await this.trips.save(trip);
  }
}
