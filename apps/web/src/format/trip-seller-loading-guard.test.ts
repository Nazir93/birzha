import { describe, expect, it } from "vitest";

import {
  listTripLinkedWarehouseIdsFromManifests,
  tripSellerBlocksCrossWarehouseLoading,
} from "./trip-seller-loading-guard.js";

describe("tripSellerBlocksCrossWarehouseLoading", () => {
  it("не блокирует без продавца", () => {
    expect(
      tripSellerBlocksCrossWarehouseLoading({
        trip: { assignedSellerUserId: null },
        warehouseId: "wh-b",
        linkedWarehouseIds: ["wh-a"],
      }),
    ).toBe(false);
  });

  it("блокирует чужой склад после закрепления", () => {
    expect(
      tripSellerBlocksCrossWarehouseLoading({
        trip: { assignedSellerUserId: "u1" },
        warehouseId: "wh-b",
        linkedWarehouseIds: ["wh-a"],
      }),
    ).toBe(true);
  });
});

describe("listTripLinkedWarehouseIdsFromManifests", () => {
  it("собирает склады по tripId", () => {
    expect(
      listTripLinkedWarehouseIdsFromManifests("t1", [
        {
          id: "m1",
          tripId: "t1",
          warehouseId: "wh-a",
        } as never,
        {
          id: "m2",
          tripId: "t1",
          warehouseId: "wh-b",
        } as never,
        {
          id: "m3",
          tripId: "t2",
          warehouseId: "wh-x",
        } as never,
      ]),
    ).toEqual(["wh-a", "wh-b"]);
  });
});
