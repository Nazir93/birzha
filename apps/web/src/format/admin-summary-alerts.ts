export type AdminSummaryAlert = {
  id: string;
  label: string;
  count: number;
  href: string;
};

export function buildAdminSummaryAlerts(input: {
  loadingManifestsWithoutTrip: number;
  openTripsReadyToClose: number;
  unassignedOpenTripsCount: number;
  distributionRoute: string;
  assignSellerRoute: string;
  tripsSectionHash: string;
}): AdminSummaryAlert[] {
  const alerts: AdminSummaryAlert[] = [];
  if (input.loadingManifestsWithoutTrip > 0) {
    alerts.push({
      id: "manifests-without-trip",
      label: "ПН без рейса",
      count: input.loadingManifestsWithoutTrip,
      href: input.distributionRoute,
    });
  }
  if (input.openTripsReadyToClose > 0) {
    alerts.push({
      id: "trips-ready-to-close",
      label: "Рейсы готовы к закрытию",
      count: input.openTripsReadyToClose,
      href: input.tripsSectionHash,
    });
  }
  if (input.unassignedOpenTripsCount > 0) {
    alerts.push({
      id: "trips-without-seller",
      label: "Рейсы без продавца",
      count: input.unassignedOpenTripsCount,
      href: input.assignSellerRoute,
    });
  }
  return alerts;
}

export function countUnassignedOpenTrips(
  trips: readonly { status: string; assignedSellerUserId?: string | null }[],
): number {
  return trips.filter(
    (t) =>
      t.status === "open" &&
      (t.assignedSellerUserId == null || t.assignedSellerUserId.trim() === ""),
  ).length;
}
