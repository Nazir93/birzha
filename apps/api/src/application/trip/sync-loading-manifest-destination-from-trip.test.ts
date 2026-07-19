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

  it("при смене города меняется подпись номера", () => {
    const moscow = buildLoadingManifestNumberForTripDestination({
      tripNumber: "01",
      destinationLabel: "Москва",
      docDate: new Date("2026-07-19T00:00:00.000Z"),
    });
    const astrakhan = buildLoadingManifestNumberForTripDestination({
      tripNumber: "01",
      destinationLabel: "Астрахань",
      docDate: new Date("2026-07-19T00:00:00.000Z"),
    });
    expect(moscow).toBe("01 · Москва · 19.07.2026");
    expect(astrakhan).toBe("01 · Астрахань · 19.07.2026");
    expect(moscow).not.toBe(astrakhan);
  });
});
