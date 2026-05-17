import { describe, expect, it } from "vitest";

import type { LoadingManifestDetail } from "../api/types.js";

import { loadingManifestTripAssignLockFromDetail } from "./loading-manifest-trip-assign-lock.js";

function detail(partial: Partial<LoadingManifestDetail> & Pick<LoadingManifestDetail, "id">): LoadingManifestDetail {
  return {
    id: partial.id,
    manifestNumber: "1",
    docDate: "2026-01-01",
    warehouseId: "w",
    warehouseName: "W",
    warehouseCode: "w",
    destinationCode: "d",
    destinationName: "D",
    tripId: null,
    createdAt: "",
    lines: [],
    ...partial,
  };
}

describe("loadingManifestTripAssignLockFromDetail", () => {
  it("блокирует по tripAssignLocked с API", () => {
    expect(
      loadingManifestTripAssignLockFromDetail(
        detail({
          id: "m1",
          tripAssignLocked: true,
          tripAssignLockedReason: "already_shipped",
        }),
      ),
    ).toEqual({ locked: true, code: "already_shipped" });
  });

  it("fallback: tripId задан", () => {
    expect(loadingManifestTripAssignLockFromDetail(detail({ id: "m1", tripId: "t-1" }))).toEqual({
      locked: true,
      code: "already_assigned",
    });
  });
});
