import { Trip } from "@birzha/domain";
import { describe, expect, it, vi } from "vitest";

import { LoadingManifestTripDestinationMismatchError, TripNotFoundError } from "../errors.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import { assertTripAllowsWarehouseLoading } from "./assert-trip-warehouse-loading.js";

function tripWithDest(id: string, destinationCode: string | null): Trip {
  return Trip.create({ id, tripNumber: "01", destinationCode });
}

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

  it("отклоняет несовпадение города рейса и ПН", async () => {
    const trips: TripRepository = {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(tripWithDest("t1", "astrakhan")),
      list: vi.fn(),
      count: vi.fn(),
      deleteById: vi.fn(),
    };
    await expect(
      assertTripAllowsWarehouseLoading(db, trips, {
        tripId: "t1",
        warehouseId: "w1",
        manifestId: "m1",
        manifestDestinationCode: "moscow",
      }),
    ).rejects.toBeInstanceOf(LoadingManifestTripDestinationMismatchError);
  });

  it("разрешает совпадение города", async () => {
    const trip = tripWithDest("t1", "moscow");
    const trips: TripRepository = {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(trip),
      list: vi.fn(),
      count: vi.fn(),
      deleteById: vi.fn(),
    };
    await expect(
      assertTripAllowsWarehouseLoading(db, trips, {
        tripId: "t1",
        warehouseId: "w1",
        manifestId: "m1",
        manifestDestinationCode: "moscow",
      }),
    ).resolves.toBe(trip);
  });
});
