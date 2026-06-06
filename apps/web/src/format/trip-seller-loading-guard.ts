import type { LoadingManifestSummary, TripJson } from "../api/types.js";

export function listTripLinkedWarehouseIdsFromManifests(
  tripId: string,
  manifests: readonly LoadingManifestSummary[],
): string[] {
  const id = tripId.trim();
  if (!id) {
    return [];
  }
  return [...new Set(manifests.filter((m) => m.tripId === id).map((m) => m.warehouseId))];
}

export function tripSellerBlocksCrossWarehouseLoading(input: {
  trip: Pick<TripJson, "assignedSellerUserId"> | null | undefined;
  warehouseId: string;
  linkedWarehouseIds: readonly string[];
}): boolean {
  const sellerId = input.trip?.assignedSellerUserId?.trim() ?? "";
  if (!sellerId) {
    return false;
  }
  const warehouseId = input.warehouseId.trim();
  if (!warehouseId) {
    return false;
  }
  const linked = input.linkedWarehouseIds.map((id) => id.trim()).filter(Boolean);
  if (linked.length === 0) {
    return false;
  }
  return !linked.includes(warehouseId);
}

export const TRIP_SELLER_CROSS_WAREHOUSE_LOADING_MESSAGE =
  "Рейс закреплён за продавцом — догрузка с другого склада недоступна. Завершите погрузку со всех складов, затем закрепите продавца.";
