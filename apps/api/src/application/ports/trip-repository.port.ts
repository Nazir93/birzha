import type { Trip } from "@birzha/domain";

/** Фильтр списка рейсов (GET /api/trips?search=&limit=&offset=&order=). Без аргумента — полный список как раньше. */
export type TripListFilter = {
  search?: string;
  limit?: number;
  offset?: number;
  /** По умолчанию для подборщика — сначала свежие по дате выезда. */
  order?: "tripNumberAsc" | "departedAtDesc";
};

export interface TripRepository {
  save(trip: Trip): Promise<void>;
  findById(id: string): Promise<Trip | null>;
  list(filter?: TripListFilter): Promise<Trip[]>;
  /** Удалить строку рейса (только если нет движений по журналам — проверяет use case). */
  deleteById(id: string): Promise<void>;
}
