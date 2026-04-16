import type { Trip } from "@birzha/domain";

export interface TripRepository {
  save(trip: Trip): Promise<void>;
  findById(id: string): Promise<Trip | null>;
  list(): Promise<Trip[]>;
}
