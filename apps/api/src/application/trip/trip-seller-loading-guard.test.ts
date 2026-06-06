import { describe, expect, it } from "vitest";

import {
  evaluateTripSellerLoadingFromWarehouse,
  tripSellerCrossWarehouseLoadingMessage,
} from "./trip-seller-loading-guard.js";

describe("evaluateTripSellerLoadingFromWarehouse", () => {
  it("без продавца — любой склад", () => {
    expect(
      evaluateTripSellerLoadingFromWarehouse({
        assignedSellerUserId: null,
        warehouseId: "wh-b",
        tripLinkedWarehouseIds: ["wh-a"],
      }),
    ).toEqual({ allowed: true });
  });

  it("с продавцом, рейс пустой — первая погрузка с любого склада", () => {
    expect(
      evaluateTripSellerLoadingFromWarehouse({
        assignedSellerUserId: "seller-1",
        warehouseId: "wh-a",
        tripLinkedWarehouseIds: [],
      }),
    ).toEqual({ allowed: true });
  });

  it("с продавцом — разрешает уже участвовавший склад", () => {
    expect(
      evaluateTripSellerLoadingFromWarehouse({
        assignedSellerUserId: "seller-1",
        warehouseId: "wh-a",
        tripLinkedWarehouseIds: ["wh-a", "wh-b"],
      }),
    ).toEqual({ allowed: true });
  });

  it("с продавцом — блокирует новый склад", () => {
    expect(
      evaluateTripSellerLoadingFromWarehouse({
        assignedSellerUserId: "seller-1",
        warehouseId: "wh-c",
        tripLinkedWarehouseIds: ["wh-a"],
      }),
    ).toEqual({ allowed: false, code: "trip_seller_assigned_cross_warehouse" });
  });
});

describe("tripSellerCrossWarehouseLoadingMessage", () => {
  it("объясняет порядок погрузка → продавец", () => {
    expect(tripSellerCrossWarehouseLoadingMessage("trip_seller_assigned_cross_warehouse")).toContain("продавцом");
  });
});
