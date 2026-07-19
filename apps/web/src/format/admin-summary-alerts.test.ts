import { describe, expect, it } from "vitest";

import {
  ASSIGN_UNASSIGNED_TRIPS_HASH,
  buildAdminSummaryAlerts,
  countUnassignedOpenTrips,
} from "./admin-summary-alerts.js";

describe("admin-summary-alerts", () => {
  it("buildAdminSummaryAlerts — только ненулевые", () => {
    const alerts = buildAdminSummaryAlerts({
      loadingManifestsWithoutTrip: 2,
      openTripsReadyToClose: 0,
      unassignedOpenTripsCount: 1,
      distributionRoute: "/a/distribution",
      assignSellerRoute: "/a/assign-seller",
      tripsSectionHash: "#admin-trips-in-work",
    });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]!.id).toBe("manifests-without-trip");
    expect(alerts[1]!.id).toBe("trips-without-seller");
    expect(alerts[1]!.href).toBe(`/a/assign-seller#${ASSIGN_UNASSIGNED_TRIPS_HASH}`);
  });

  it("countUnassignedOpenTrips", () => {
    expect(
      countUnassignedOpenTrips([
        { status: "open", assignedSellerUserId: null },
        { status: "open", assignedSellerUserId: "u1" },
        { status: "closed", assignedSellerUserId: null },
        { status: "open", assignedSellerUserId: "" },
      ]),
    ).toBe(2);
  });
});
