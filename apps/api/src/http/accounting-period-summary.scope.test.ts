import { describe, expect, it } from "vitest";
import { Trip } from "@birzha/domain";

import {
  filterTripsForAccountingScope,
  hasAccountingPeriodScope,
} from "./accounting-period-summary.js";

describe("accounting period summary scope", () => {
  const trips = [
    Trip.create({ id: "t1", tripNumber: "01", destinationCode: "moscow" }),
    Trip.create({ id: "t2", tripNumber: "02", destinationCode: "spb" }),
    Trip.create({ id: "t3", tripNumber: "03", destinationCode: "moscow" }),
  ];

  it("hasAccountingPeriodScope", () => {
    expect(hasAccountingPeriodScope({})).toBe(false);
    expect(hasAccountingPeriodScope({ destinationCode: "moscow" })).toBe(true);
    expect(hasAccountingPeriodScope({ tripId: "t1" })).toBe(true);
  });

  it("фильтр по региону", () => {
    const r = filterTripsForAccountingScope(trips, { destinationCode: "moscow" });
    expect(r.map((t) => t.getId())).toEqual(["t1", "t3"]);
  });

  it("фильтр по рейсу и региону", () => {
    const r = filterTripsForAccountingScope(trips, { destinationCode: "moscow", tripId: "t3" });
    expect(r.map((t) => t.getId())).toEqual(["t3"]);
  });
});
