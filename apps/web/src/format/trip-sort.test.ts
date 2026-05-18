import { describe, expect, it } from "vitest";

import type { TripJson } from "../api/types.js";

import { sortTripsByDepartedDesc, splitTripsByStatus } from "./trip-sort.js";

function trip(partial: Partial<TripJson> & Pick<TripJson, "id" | "tripNumber" | "status">): TripJson {
  return {
    vehicleLabel: null,
    driverName: null,
    departedAt: null,
    assignedSellerUserId: null,
    hasShipmentToTrip: false,
    transitRemainingGrams: null,
    ...partial,
  };
}

describe("trip-sort", () => {
  it("splitTripsByStatus делит open и closed", () => {
    const { open, closed } = splitTripsByStatus([
      trip({ id: "1", tripNumber: "1", status: "open" }),
      trip({ id: "2", tripNumber: "2", status: "closed" }),
      trip({ id: "3", tripNumber: "3", status: "open" }),
    ]);
    expect(open.map((t) => t.id)).toEqual(["1", "3"]);
    expect(closed.map((t) => t.id)).toEqual(["2"]);
  });

  it("sortTripsByDepartedDesc — свежие выезды выше", () => {
    const sorted = sortTripsByDepartedDesc([
      { tripNumber: "A", departedAt: "2024-01-01T00:00:00.000Z" },
      { tripNumber: "B", departedAt: "2025-06-01T00:00:00.000Z" },
    ]);
    expect(sorted.map((t) => t.tripNumber)).toEqual(["B", "A"]);
  });
});
