import { describe, expect, it } from "vitest";

import type { TripJson } from "../api/types.js";
import { sumOpenTripsMassKg } from "./admin-dashboard-aggregates.js";

function trip(overrides: Partial<TripJson> & { id: string }): TripJson {
  return {
    id: overrides.id,
    tripNumber: overrides.tripNumber ?? "Р-1",
    status: overrides.status ?? "open",
    vehicleLabel: null,
    driverName: null,
    departedAt: null,
    assignedSellerUserId: null,
    ...overrides,
  };
}

describe("sumOpenTripsMassKg", () => {
  it("суммирует только открытые рейсы", () => {
    const kg = sumOpenTripsMassKg([
      trip({
        id: "t1",
        shippedGrams: "2000000",
        soldGrams: "500000",
        transitRemainingGrams: "1500000",
      }),
      trip({
        id: "t2",
        status: "closed",
        shippedGrams: "9000000",
        soldGrams: "9000000",
        transitRemainingGrams: "0",
      }),
    ]);
    expect(kg.shippedKg).toBe(2000);
    expect(kg.soldKg).toBe(500);
    expect(kg.remainingInTripKg).toBe(1500);
  });
});
