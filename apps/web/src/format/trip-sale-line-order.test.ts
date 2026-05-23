import { describe, expect, it } from "vitest";

import type { TripSaleLineJson } from "../api/types.js";

import { sortTripSaleLinesNewestFirst } from "./trip-sale-line-order.js";

function line(id: string, recordedAt: string): TripSaleLineJson {
  return {
    id,
    tripId: "t1",
    batchId: "b1",
    saleId: "s1",
    kg: "1",
    packageCount: null,
    pricePerKgKopecks: "100",
    revenueKopecks: "100",
    cashKopecks: "100",
    debtKopecks: "0",
    cardTransferKopecks: "0",
    saleChannel: "retail",
    clientLabel: null,
    wholesaleBuyerId: null,
    recordedAt,
  };
}

describe("sortTripSaleLinesNewestFirst", () => {
  it("ставит более позднюю продажу выше", () => {
    const sorted = sortTripSaleLinesNewestFirst([
      line("a", "2026-05-19T10:00:00.000Z"),
      line("b", "2026-05-19T12:00:00.000Z"),
      line("c", "2026-05-19T11:00:00.000Z"),
    ]);
    expect(sorted.map((l) => l.id)).toEqual(["b", "c", "a"]);
  });
});
