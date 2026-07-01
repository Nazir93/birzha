import { describe, expect, it } from "vitest";

import { loadingManifestTripDetachable } from "./loading-manifest-trip-detachable.js";

describe("loadingManifestTripDetachable", () => {
  it("blocks when manifest is not linked", () => {
    expect(
      loadingManifestTripDetachable({
        tripId: null,
        tripStatus: "open",
        batches: [],
      }),
    ).toEqual({ detachable: false, code: "not_linked" });
  });

  it("blocks when trip is closed", () => {
    expect(
      loadingManifestTripDetachable({
        tripId: "t-1",
        tripStatus: "closed",
        batches: [],
      }),
    ).toEqual({ detachable: false, code: "trip_closed" });
  });

  it("allows unlink when linked but not shipped", () => {
    expect(
      loadingManifestTripDetachable({
        tripId: "t-1",
        tripStatus: "open",
        batches: [
          {
            manifestGrams: 5000n,
            shipmentGramsOnTrip: 0n,
            inTransitGrams: 0n,
            soldGramsOnTrip: 0n,
            shortageGramsOnTrip: 0n,
          },
        ],
      }),
    ).toEqual({ detachable: true });
  });

  it("allows detach when shipped mass can return to warehouse", () => {
    expect(
      loadingManifestTripDetachable({
        tripId: "t-1",
        tripStatus: "open",
        batches: [
          {
            manifestGrams: 5000n,
            shipmentGramsOnTrip: 5000n,
            inTransitGrams: 5000n,
            soldGramsOnTrip: 0n,
            shortageGramsOnTrip: 0n,
          },
        ],
      }),
    ).toEqual({ detachable: true });
  });

  it("blocks when sales exist on trip", () => {
    expect(
      loadingManifestTripDetachable({
        tripId: "t-1",
        tripStatus: "open",
        batches: [
          {
            manifestGrams: 5000n,
            shipmentGramsOnTrip: 5000n,
            inTransitGrams: 3000n,
            soldGramsOnTrip: 2000n,
            shortageGramsOnTrip: 0n,
          },
        ],
      }),
    ).toEqual({ detachable: false, code: "sales_or_shortage" });
  });

  it("blocks when shipment ledger is less than manifest mass", () => {
    expect(
      loadingManifestTripDetachable({
        tripId: "t-1",
        tripStatus: "open",
        batches: [
          {
            manifestGrams: 5000n,
            shipmentGramsOnTrip: 3000n,
            inTransitGrams: 3000n,
            soldGramsOnTrip: 0n,
            shortageGramsOnTrip: 0n,
          },
        ],
      }),
    ).toEqual({ detachable: false, code: "shipment_mismatch" });
  });
});
