import { describe, expect, it } from "vitest";

import { tripLocksManifestDestination } from "./loading-manifest-trip-destination.js";

describe("tripLocksManifestDestination", () => {
  it("true если у рейса есть город", () => {
    expect(tripLocksManifestDestination({ destinationCode: "moscow" })).toBe(true);
  });

  it("false без города", () => {
    expect(tripLocksManifestDestination({ destinationCode: null })).toBe(false);
    expect(tripLocksManifestDestination(undefined)).toBe(false);
  });
});
