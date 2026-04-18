import type { Trip } from "@birzha/domain";

import type { TripRepository } from "../ports/trip-repository.port.js";

export class InMemoryTripRepository implements TripRepository {
  private readonly byId = new Map<string, Trip>();

  async save(trip: Trip): Promise<void> {
    this.byId.set(trip.getId(), trip);
  }

  async findById(id: string): Promise<Trip | null> {
    return this.byId.get(id) ?? null;
  }

  async list(): Promise<Trip[]> {
    return [...this.byId.values()].sort((a, b) =>
      a.getTripNumber().localeCompare(b.getTripNumber(), "ru"),
    );
  }

  async deleteById(id: string): Promise<void> {
    this.byId.delete(id);
  }
}
