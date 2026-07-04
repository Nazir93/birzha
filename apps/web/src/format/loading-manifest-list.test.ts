import { describe, expect, it } from "vitest";

import type { LoadingManifestSummary } from "../api/types.js";

import { groupLoadingManifestNumbersByTripId, manifestsForWarehouseSorted, sortLoadingManifestsByCreatedAtDesc } from "./loading-manifest-list.js";

function m(p: Partial<LoadingManifestSummary> & Pick<LoadingManifestSummary, "id" | "warehouseId" | "createdAt">): LoadingManifestSummary {
  return {
    manifestNumber: "1",
    docDate: "2024-01-01",
    warehouseName: "W",
    warehouseCode: "w",
    destinationCode: "moscow",
    destinationName: "Москва",
    tripId: null,
    lineCount: 1,
    totalKg: 10,
    packagesApprox: null,
    calibers: [],
    ...p,
  };
}

describe("sortLoadingManifestsByCreatedAtDesc", () => {
  it("сортирует по createdAt по убыванию", () => {
    const rows = [
      m({ id: "old", warehouseId: "wh-1", createdAt: "2024-01-01T10:00:00.000Z" }),
      m({ id: "new", warehouseId: "wh-2", createdAt: "2024-06-01T12:00:00.000Z" }),
    ];
    expect(sortLoadingManifestsByCreatedAtDesc(rows).map((x) => x.id)).toEqual(["new", "old"]);
  });
});

describe("groupLoadingManifestNumbersByTripId", () => {
  it("группирует номера ПН по tripId", () => {
    const map = groupLoadingManifestNumbersByTripId([
      m({ id: "m1", warehouseId: "wh-1", createdAt: "2024-01-01T10:00:00.000Z", tripId: "t1", manifestNumber: "PN-2" }),
      m({ id: "m2", warehouseId: "wh-1", createdAt: "2024-01-02T10:00:00.000Z", tripId: "t1", manifestNumber: "PN-1" }),
      m({ id: "m3", warehouseId: "wh-2", createdAt: "2024-01-03T10:00:00.000Z", tripId: null, manifestNumber: "PN-3" }),
    ]);
    expect(map.get("t1")).toEqual(["PN-1", "PN-2"]);
    expect(map.has("t2")).toBe(false);
  });
});

describe("manifestsForWarehouseSorted", () => {
  it("пустой или пробельный warehouseId — пустой массив", () => {
    expect(manifestsForWarehouseSorted([], "")).toEqual([]);
    expect(manifestsForWarehouseSorted(undefined, "   ")).toEqual([]);
  });

  it("undefined список — как пустой", () => {
    expect(manifestsForWarehouseSorted(undefined, "wh-1")).toEqual([]);
  });

  it("фильтрует по warehouseId", () => {
    const rows = [
      m({ id: "a", warehouseId: "wh-1", createdAt: "2024-01-01T10:00:00.000Z" }),
      m({ id: "b", warehouseId: "wh-2", createdAt: "2024-01-02T10:00:00.000Z" }),
    ];
    const r = manifestsForWarehouseSorted(rows, "wh-1");
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });

  it("сортирует по createdAt по убыванию (новее выше)", () => {
    const rows = [
      m({ id: "old", warehouseId: "wh-1", createdAt: "2024-01-01T10:00:00.000Z" }),
      m({ id: "new", warehouseId: "wh-1", createdAt: "2024-06-01T12:00:00.000Z" }),
    ];
    const r = manifestsForWarehouseSorted(rows, "wh-1");
    expect(r.map((x) => x.id)).toEqual(["new", "old"]);
  });
});
