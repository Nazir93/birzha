import { describe, expect, it } from "vitest";

import { planLoadingManifestAssignTripShipment } from "./loading-manifest-assign-trip-ship.plan.js";

describe("planLoadingManifestAssignTripShipment", () => {
  it("нет дельты — none", () => {
    expect(
      planLoadingManifestAssignTripShipment({
        lineGrams: 1000n,
        ledgerGramsForTripBatch: 1000n,
        onWarehouseGrams: 5000n,
        inTransitGrams: 0n,
      }),
    ).toEqual({ kind: "none" });
  });

  it("есть склад — только ship_from_warehouse (min дельта, склад)", () => {
    expect(
      planLoadingManifestAssignTripShipment({
        lineGrams: 5000n,
        ledgerGramsForTripBatch: 0n,
        onWarehouseGrams: 3000n,
        inTransitGrams: 0n,
      }),
    ).toEqual({ kind: "ship_from_warehouse", grams: 3000n });
  });

  it("склад 0, масса в пути — дозапись журнала без shipToTrip", () => {
    expect(
      planLoadingManifestAssignTripShipment({
        lineGrams: 10_000n,
        ledgerGramsForTripBatch: 0n,
        onWarehouseGrams: 0n,
        inTransitGrams: 10_000n,
      }),
    ).toEqual({ kind: "ledger_append_in_transit", grams: 10_000n });
  });

  it("склад 0, в пути меньше дельты — режем по inTransit", () => {
    expect(
      planLoadingManifestAssignTripShipment({
        lineGrams: 10_000n,
        ledgerGramsForTripBatch: 0n,
        onWarehouseGrams: 0n,
        inTransitGrams: 4000n,
      }),
    ).toEqual({ kind: "ledger_append_in_transit", grams: 4000n });
  });

  it("часть уже в журнале рейса — дельта по строке ПН", () => {
    expect(
      planLoadingManifestAssignTripShipment({
        lineGrams: 10_000n,
        ledgerGramsForTripBatch: 6000n,
        onWarehouseGrams: 0n,
        inTransitGrams: 5000n,
      }),
    ).toEqual({ kind: "ledger_append_in_transit", grams: 4000n });
  });
});
