import type { Trip } from "@birzha/domain";

import type { TripListFilter, TripRepository } from "../ports/trip-repository.port.js";

export class InMemoryTripRepository implements TripRepository {
  private readonly byId = new Map<string, Trip>();

  async save(trip: Trip): Promise<void> {
    this.byId.set(trip.getId(), trip);
  }

  async findById(id: string): Promise<Trip | null> {
    return this.byId.get(id) ?? null;
  }

  private filtered(filter?: Omit<TripListFilter, "limit" | "offset">): Trip[] {
    let arr = [...this.byId.values()];
    if (filter?.search?.trim()) {
      const s = filter.search.trim().toLowerCase();
      arr = arr.filter((t) => t.getTripNumber().toLowerCase().includes(s));
    }
    if (filter?.status) {
      arr = arr.filter((t) => t.getStatus() === filter.status);
    }
    return arr;
  }

  async count(filter?: Omit<TripListFilter, "limit" | "offset">): Promise<number> {
    return this.filtered(filter).length;
  }

  async list(filter?: TripListFilter): Promise<Trip[]> {
    const arr = this.filtered(filter);
    const cmp =
      filter?.order === "tripNumberAsc"
        ? (a: Trip, b: Trip) => a.getTripNumber().localeCompare(b.getTripNumber(), "ru")
        : (a: Trip, b: Trip) => {
            const da = a.getDepartedAt()?.getTime() ?? 0;
            const db = b.getDepartedAt()?.getTime() ?? 0;
            if (db !== da) {
              return db - da;
            }
            return a.getTripNumber().localeCompare(b.getTripNumber(), "ru");
          };

    arr.sort(cmp);

    const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500);
    const offset = Math.max(filter?.offset ?? 0, 0);
    return arr.slice(offset, offset + limit);
  }

  async deleteById(id: string): Promise<void> {
    this.byId.delete(id);
  }
}
