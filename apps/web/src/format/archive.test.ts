import { describe, expect, it } from "vitest";

import type { TripJson } from "../api/types.js";

import { closedTripIdSet, filterTripsInWork, isTripArchived } from "./archive.js";

function trip(partial: Partial<TripJson> & Pick<TripJson, "id" | "tripNumber" | "status">): TripJson {
  return {
    departedAt: null,
    vehicleLabel: null,
    driverName: null,
    assignedSellerUserId: null,
    totalGrams: "0",
    soldGrams: "0",
    inTransitGrams: "0",
    ...partial,
  };
}

describe("archive", () => {
  it("isTripArchived и filterTripsInWork", () => {
    const open = trip({ id: "1", tripNumber: "1", status: "open" });
    const closed = trip({ id: "2", tripNumber: "2", status: "closed" });
    expect(isTripArchived(closed)).toBe(true);
    expect(filterTripsInWork([open, closed]).map((t) => t.id)).toEqual(["1"]);
  });

  it("closedTripIdSet", () => {
    const ids = closedTripIdSet([
      trip({ id: "t1", tripNumber: "1", status: "closed" }),
      trip({ id: "t2", tripNumber: "2", status: "open" }),
    ]);
    expect([...ids]).toEqual(["t1"]);
  });
});
