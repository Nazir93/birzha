import type { Trip } from "@birzha/domain";

export interface TripRepository {
  save(trip: Trip): Promise<void>;
  findById(id: string): Promise<Trip | null>;
  list(): Promise<Trip[]>;
  /** Удалить строку рейса (только если нет движений по журналам — проверяет use case). */
  deleteById(id: string): Promise<void>;
}
