import { describe, expect, it } from "vitest";

import type { TripSaleLineJson } from "../api/types.js";

import { formatSellerCorrectionSaleMeta } from "./trip-sale-line-display.js";

function line(overrides: Partial<TripSaleLineJson> = {}): TripSaleLineJson {
  return {
    id: "l1",
    tripId: "t1",
    batchId: "b1",
    saleId: "s1",
    kg: "10",
    packageCount: null,
    pricePerKgKopecks: "10000",
    revenueKopecks: "100000",
    cashKopecks: "100000",
    debtKopecks: "0",
    cardTransferKopecks: "0",
    saleChannel: "retail",
    clientLabel: null,
    wholesaleBuyerId: null,
    recordedAt: "2026-05-19T12:00:00.000Z",
    ...overrides,
  };
}

describe("formatSellerCorrectionSaleMeta", () => {
  it("розница без оптовика", () => {
    expect(formatSellerCorrectionSaleMeta(line())).toBe("10 кг · 100 ₽/кг");
  });

  it("опт с именем из clientLabel", () => {
    expect(
      formatSellerCorrectionSaleMeta(
        line({ saleChannel: "wholesale", clientLabel: "ООО Восток", wholesaleBuyerId: "w1" }),
      ),
    ).toBe("10 кг · 100 ₽/кг · Опт: ООО Восток");
  });
});
