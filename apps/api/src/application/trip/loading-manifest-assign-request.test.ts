import { describe, expect, it } from "vitest";

import { classifyLoadingManifestAssignRequest } from "./loading-manifest-assign-request.js";

describe("classifyLoadingManifestAssignRequest", () => {
  it("proceed when manifest is not yet assigned", () => {
    expect(
      classifyLoadingManifestAssignRequest({
        existingTripId: null,
        requestedTripId: "trip-1",
      }),
    ).toBe("proceed");
  });

  it("idempotent when assigning same trip again", () => {
    expect(
      classifyLoadingManifestAssignRequest({
        existingTripId: "trip-1",
        requestedTripId: "trip-1",
      }),
    ).toBe("idempotent");
  });

  it("change_forbidden when attempting to switch trip", () => {
    expect(
      classifyLoadingManifestAssignRequest({
        existingTripId: "trip-1",
        requestedTripId: "trip-2",
      }),
    ).toBe("change_forbidden");
  });
});
