import { Trip } from "@birzha/domain";
import { describe, expect, it, vi } from "vitest";

import { TripNotFoundError } from "../errors.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import { assertTripAllowsWarehouseLoading } from "./assert-trip-warehouse-loading.js";

describe("assertTripAllowsWarehouseLoading", () => {
  const db = {} as never;

  it("бросает TripNotFoundError", async () => {
    const trips: TripRepository = {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      list: vi.fn(),
      count: vi.fn(),
      deleteById: vi.fn(),
    };
    await expect(
      assertTripAllowsWarehouseLoading(db, trips, { tripId: "t1", warehouseId: "w1" }),
    ).rejects.toBeInstanceOf(TripNotFoundError);
  });

  it("возвращает рейс", async () => {
    const trip = Trip.create({ id: "t1", tripNumber: "01", destinationCode: "moscow" });
    const trips: TripRepository = {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(trip),
      list: vi.fn(),
      count: vi.fn(),
      deleteById: vi.fn(),
    };
    await expect(
      assertTripAllowsWarehouseLoading(db, trips, { tripId: "t1", warehouseId: "w1" }),
    ).resolves.toBe(trip);
  });
});
