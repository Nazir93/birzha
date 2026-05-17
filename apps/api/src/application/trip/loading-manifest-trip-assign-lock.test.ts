import { describe, expect, it } from "vitest";

import {
  loadingManifestTripAssignLock,
  loadingManifestTripAssignLockMessage,
} from "./loading-manifest-trip-assign-lock.js";

describe("loadingManifestTripAssignLock", () => {
  it("блокирует, если tripId уже задан", () => {
    expect(
      loadingManifestTripAssignLock({
        tripId: "t-1",
        lineMasses: [{ onWarehouseGrams: 1000n, inTransitGrams: 0n }],
      }),
    ).toEqual({ locked: true, code: "already_assigned" });
  });

  it("разрешает при остатке на складе", () => {
    expect(
      loadingManifestTripAssignLock({
        tripId: null,
        lineMasses: [{ onWarehouseGrams: 500n, inTransitGrams: 0n }],
      }),
    ).toEqual({ locked: false });
  });

  it("блокирует, если на складе 0, но есть в рейсе", () => {
    expect(
      loadingManifestTripAssignLock({
        tripId: null,
        lineMasses: [{ onWarehouseGrams: 0n, inTransitGrams: 200n }],
      }),
    ).toEqual({ locked: true, code: "already_shipped" });
  });

  it("блокирует, если масса полностью ушла со склада без рейса", () => {
    expect(
      loadingManifestTripAssignLock({
        tripId: null,
        lineMasses: [{ onWarehouseGrams: 0n, inTransitGrams: 0n }],
      }),
    ).toEqual({ locked: true, code: "no_stock" });
  });
});

describe("loadingManifestTripAssignLockMessage", () => {
  it("возвращает текст для already_assigned", () => {
    expect(loadingManifestTripAssignLockMessage("already_assigned")).toContain("уже привязана");
  });
});
