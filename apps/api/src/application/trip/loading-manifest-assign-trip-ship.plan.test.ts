import { describe, expect, it } from "vitest";

import { planLoadingManifestAssignTripShipment } from "./loading-manifest-assign-trip-ship.plan.js";

describe("planLoadingManifestAssignTripShipment", () => {
  it("нет дельты — none", () => {
    expect(
      planLoadingManifestAssignTripShipment({
        lineGrams: 1000n,
        linePackageCount: null,
        ledgerGramsForTripBatch: 1000n,
        ledgerPackageCountForTripBatch: 0n,
        onWarehouseGrams: 5000n,
        inTransitGrams: 0n,
      }),
    ).toEqual({ kind: "none" });
  });

  it("есть склад — только ship_from_warehouse (min дельта, склад)", () => {
    expect(
      planLoadingManifestAssignTripShipment({
        lineGrams: 5000n,
        linePackageCount: 100n,
        ledgerGramsForTripBatch: 0n,
        ledgerPackageCountForTripBatch: 0n,
        onWarehouseGrams: 3000n,
        inTransitGrams: 0n,
      }),
    ).toEqual({ kind: "ship_from_warehouse", grams: 3000n, packageCount: 60n });
  });

  it("склад 0, масса в пути — дозапись журнала без shipToTrip", () => {
    expect(
      planLoadingManifestAssignTripShipment({
        lineGrams: 10_000n,
        linePackageCount: 250n,
        ledgerGramsForTripBatch: 0n,
        ledgerPackageCountForTripBatch: 0n,
        onWarehouseGrams: 0n,
        inTransitGrams: 10_000n,
      }),
    ).toEqual({ kind: "ledger_append_in_transit", grams: 10_000n, packageCount: 250n });
  });

  it("склад 0, в пути меньше дельты — режем по inTransit", () => {
    expect(
      planLoadingManifestAssignTripShipment({
        lineGrams: 10_000n,
        linePackageCount: 250n,
        ledgerGramsForTripBatch: 0n,
        ledgerPackageCountForTripBatch: 0n,
        onWarehouseGrams: 0n,
        inTransitGrams: 4000n,
      }),
    ).toEqual({ kind: "ledger_append_in_transit", grams: 4000n, packageCount: 100n });
  });

  it("часть уже в журнале рейса — дельта по строке ПН", () => {
    expect(
      planLoadingManifestAssignTripShipment({
        lineGrams: 10_000n,
        linePackageCount: 250n,
        ledgerGramsForTripBatch: 6000n,
        ledgerPackageCountForTripBatch: 0n,
        onWarehouseGrams: 0n,
        inTransitGrams: 5000n,
      }),
    ).toEqual({ kind: "ledger_append_in_transit", grams: 4000n, packageCount: 100n });
  });

  it("не начисляет лишние ящики, если часть уже в журнале рейса", () => {
    expect(
      planLoadingManifestAssignTripShipment({
        lineGrams: 10_000n,
        linePackageCount: 250n,
        ledgerGramsForTripBatch: 6_000n,
        ledgerPackageCountForTripBatch: 140n,
        onWarehouseGrams: 0n,
        inTransitGrams: 5_000n,
      }),
    ).toEqual({ kind: "ledger_append_in_transit", grams: 4000n, packageCount: 100n });
  });

  it("если по ПН ящики уже полностью в журнале — добавляет только граммы", () => {
    expect(
      planLoadingManifestAssignTripShipment({
        lineGrams: 10_000n,
        linePackageCount: 250n,
        ledgerGramsForTripBatch: 6_000n,
        ledgerPackageCountForTripBatch: 250n,
        onWarehouseGrams: 0n,
        inTransitGrams: 5_000n,
      }),
    ).toEqual({ kind: "ledger_append_in_transit", grams: 4000n, packageCount: null });
  });
});
