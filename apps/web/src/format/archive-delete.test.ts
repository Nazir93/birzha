import { describe, expect, it } from "vitest";

describe("archive delete API URLs", () => {
  it("fromArchive query для рейса и погрузочной", () => {
    const tripId = "trip-1";
    const manifestId = "lm-1";
    expect(`/api/trips/${encodeURIComponent(tripId)}?fromArchive=1`).toBe("/api/trips/trip-1?fromArchive=1");
    expect(`/api/loading-manifests/${encodeURIComponent(manifestId)}?fromArchive=1`).toBe(
      "/api/loading-manifests/lm-1?fromArchive=1",
    );
  });
});
