import { describe, expect, it } from "vitest";

import {
  filterTripsMatchingManifestDestination,
  tripLocksManifestDestination,
} from "./loading-manifest-trip-destination.js";

describe("tripLocksManifestDestination", () => {
  it("true если у рейса есть город", () => {
    expect(tripLocksManifestDestination({ destinationCode: "moscow" })).toBe(true);
  });

  it("false без города", () => {
    expect(tripLocksManifestDestination({ destinationCode: null })).toBe(false);
    expect(tripLocksManifestDestination(undefined)).toBe(false);
  });
});

describe("filterTripsMatchingManifestDestination", () => {
  const trips = [
    { id: "a", destinationCode: "moscow" },
    { id: "b", destinationCode: "astrakhan" },
    { id: "c", destinationCode: null },
  ];

  it("оставляет рейсы того же города и без города", () => {
    expect(filterTripsMatchingManifestDestination(trips, "moscow").map((t) => t.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("без города ПН — все рейсы", () => {
    expect(filterTripsMatchingManifestDestination(trips, "").map((t) => t.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
