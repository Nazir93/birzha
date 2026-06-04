import { describe, expect, it } from "vitest";

import { loadingManifestDeletable } from "./loading-manifest-deletable.js";

describe("loadingManifestDeletable", () => {
  it("allows delete when stock still on warehouse and no shipments", () => {
    expect(
      loadingManifestDeletable({
        lineMasses: [{ onWarehouseGrams: 5000n, inTransitGrams: 0n }],
        shipmentGramsOnLinkedTrip: 0n,
      }),
    ).toEqual({ deletable: true });
  });

  it("allows delete even if batches have in-transit mass", () => {
    expect(
      loadingManifestDeletable({
        lineMasses: [{ onWarehouseGrams: 0n, inTransitGrams: 1000n }],
        shipmentGramsOnLinkedTrip: 0n,
      }),
    ).toEqual({ deletable: true });
  });

  it("blocks when linked trip has shipment rows for manifest batches", () => {
    expect(
      loadingManifestDeletable({
        lineMasses: [{ onWarehouseGrams: 5000n, inTransitGrams: 0n }],
        shipmentGramsOnLinkedTrip: 2500n,
      }),
    ).toEqual({ deletable: false, reason: "shipped_to_trip" });
  });
});
