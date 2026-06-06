export type TripSellerLoadingRejectCode = "trip_seller_assigned_cross_warehouse";

export function tripSellerCrossWarehouseLoadingMessage(code: TripSellerLoadingRejectCode): string {
  switch (code) {
    case "trip_seller_assigned_cross_warehouse":
      return (
        "Рейс закреплён за продавцом — догрузка с другого склада недоступна. " +
        "Завершите погрузку со всех складов, затем закрепите продавца."
      );
    default:
      return "Погрузка в этот рейс недоступна.";
  }
}

/** После assign-seller: только склады, уже участвовавшие в рейсе (ПН или отгрузки). */
export function evaluateTripSellerLoadingFromWarehouse(input: {
  assignedSellerUserId: string | null | undefined;
  warehouseId: string;
  tripLinkedWarehouseIds: readonly string[];
}): { allowed: true } | { allowed: false; code: TripSellerLoadingRejectCode } {
  const sellerId = input.assignedSellerUserId?.trim() ?? "";
  if (!sellerId) {
    return { allowed: true };
  }
  const warehouseId = input.warehouseId.trim();
  if (!warehouseId) {
    return { allowed: true };
  }
  const linked = input.tripLinkedWarehouseIds.map((id) => id.trim()).filter(Boolean);
  if (linked.length === 0) {
    return { allowed: true };
  }
  if (linked.includes(warehouseId)) {
    return { allowed: true };
  }
  return { allowed: false, code: "trip_seller_assigned_cross_warehouse" };
}
