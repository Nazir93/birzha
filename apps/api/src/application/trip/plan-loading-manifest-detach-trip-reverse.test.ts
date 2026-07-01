import { describe, expect, it } from "vitest";

import { planLoadingManifestDetachTripReverse } from "./plan-loading-manifest-detach-trip-reverse.js";

describe("planLoadingManifestDetachTripReverse", () => {
  it("returns zero when manifest was linked without shipment", () => {
    expect(
      planLoadingManifestDetachTripReverse({
        manifestGrams: 5000n,
        manifestPackageCount: 10n,
        shipmentGramsOnTrip: 0n,
      }),
    ).toEqual({ grams: 0n, packageCount: null });
  });

  it("reverses full manifest mass and proportional packages", () => {
    expect(
      planLoadingManifestDetachTripReverse({
        manifestGrams: 5000n,
        manifestPackageCount: 10n,
        shipmentGramsOnTrip: 5000n,
      }),
    ).toEqual({ grams: 5000n, packageCount: 10n });
  });
});
