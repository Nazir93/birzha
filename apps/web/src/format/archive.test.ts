import { describe, expect, it } from "vitest";

import type { TripJson } from "../api/types.js";

import {
  closedTripIdSet,
  filterTripsArchived,
  filterTripsInWork,
  isLoadingManifestArchived,
  isTripArchived,
  splitLoadingManifestsByArchive,
} from "./archive.js";

function trip(partial: Partial<TripJson> & Pick<TripJson, "id" | "tripNumber" | "status">): TripJson {
  return {
    departedAt: null,
    vehicleLabel: null,
    driverName: null,
    assignedSellerUserId: null,
    totalGrams: "0",
    soldGrams: "0",
    inTransitGrams: "0",
    ...partial,
  };
}

describe("archive", () => {
  it("isTripArchived и filterTripsInWork", () => {
    const open = trip({ id: "1", tripNumber: "1", status: "open" });
    const closed = trip({ id: "2", tripNumber: "2", status: "closed" });
    expect(isTripArchived(closed)).toBe(true);
    expect(filterTripsInWork([open, closed]).map((t) => t.id)).toEqual(["1"]);
  });

  it("filterTripsArchived сортирует по дате выезда", () => {
    const a = trip({
      id: "a",
      tripNumber: "a",
      status: "closed",
      departedAt: "2026-01-01T00:00:00.000Z",
    });
    const b = trip({
      id: "b",
      tripNumber: "b",
      status: "closed",
      departedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(filterTripsArchived([a, b]).map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("погрузочная в архиве только при закрытом рейсе", () => {
    const closedIds = closedTripIdSet([
      trip({ id: "t1", tripNumber: "1", status: "closed" }),
    ]);
    expect(isLoadingManifestArchived({ tripId: "t1" }, closedIds)).toBe(true);
    expect(isLoadingManifestArchived({ tripId: "t2" }, closedIds)).toBe(false);
    expect(isLoadingManifestArchived({ tripId: null }, closedIds)).toBe(false);
  });

  it("splitLoadingManifestsByArchive", () => {
    const closedIds = new Set(["t1"]);
    const { active, archived } = splitLoadingManifestsByArchive(
      [
        { tripId: "t1", docDate: "2026-01-01", manifestNumber: "1" },
        { tripId: null, docDate: "2026-01-02", manifestNumber: "2" },
      ],
      closedIds,
    );
    expect(active).toHaveLength(1);
    expect(archived).toHaveLength(1);
    expect(archived[0]!.manifestNumber).toBe("1");
  });
});
