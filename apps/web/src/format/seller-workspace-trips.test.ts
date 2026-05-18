import { describe, expect, it } from "vitest";

import {
  TRIP_STATUS_CLOSED,
  filterTripsAssignedToSellerForReports,
  isTripOpenForSellerWorkspace,
} from "./seller-workspace-trips.js";

const trip = (partial: { id: string; status: string; assignedSellerUserId: string | null }) =>
  ({
    tripNumber: "1",
    vehicleLabel: null,
    driverName: null,
    departedAt: null,
    hasShipmentToTrip: false,
    transitRemainingGrams: null,
    ...partial,
  }) as const;

describe("seller-workspace-trips", () => {
  it("закрытый рейс не считается открытым для рабочего кабинета", () => {
    expect(isTripOpenForSellerWorkspace({ status: TRIP_STATUS_CLOSED })).toBe(false);
    expect(isTripOpenForSellerWorkspace({ status: "open" })).toBe(true);
  });

  it("filterTripsAssignedToSellerForReports — открытые и закрытые закреплённые", () => {
    const list = [
      trip({ id: "a", status: "open", assignedSellerUserId: "u1" }),
      trip({ id: "b", status: TRIP_STATUS_CLOSED, assignedSellerUserId: "u1" }),
      trip({ id: "c", status: "open", assignedSellerUserId: "u2" }),
      trip({ id: "d", status: "open", assignedSellerUserId: null }),
    ];
    expect(filterTripsAssignedToSellerForReports(list, "u1").map((t) => t.id)).toEqual(["a", "b"]);
  });
});
