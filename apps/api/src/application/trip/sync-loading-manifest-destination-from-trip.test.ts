import { describe, expect, it } from "vitest";

import { buildLoadingManifestNumberForTripDestination } from "./sync-loading-manifest-destination-from-trip.js";

describe("buildLoadingManifestNumberForTripDestination", () => {
  it("собирает номер как в UI: № · город · дата", () => {
    expect(
      buildLoadingManifestNumberForTripDestination({
        tripNumber: "01",
        destinationLabel: "Астрахань",
        docDate: new Date("2026-07-19T00:00:00.000Z"),
      }),
    ).toBe("01 · Астрахань · 19.07.2026");
  });
});
