import { describe, expect, it } from "vitest";

import { computeTripTransitDigest } from "./trip-transit-digest.js";

function emptyShipment() {
  return { totalGrams: 0n, totalPackageCount: 0n, byBatch: [] as { batchId: string; grams: bigint; packageCount: bigint }[] };
}
function emptySales() {
  return {
    totalGrams: 0n,
    totalRevenueKopecks: 0n,
    totalCashKopecks: 0n,
    totalDebtKopecks: 0n,
    totalCardTransferKopecks: 0n,
    retailGrams: 0n,
    wholesaleGrams: 0n,
    retailRevenueKopecks: 0n,
    wholesaleRevenueKopecks: 0n,
    retailCashKopecks: 0n,
    retailDebtKopecks: 0n,
    retailCardTransferKopecks: 0n,
    wholesaleCashKopecks: 0n,
    wholesaleDebtKopecks: 0n,
    wholesaleCardTransferKopecks: 0n,
    byBatch: [] as { batchId: string; grams: bigint; revenueKopecks: bigint; cashKopecks: bigint; debtKopecks: bigint; cardTransferKopecks: bigint }[],
    byClient: [],
  };
}
function emptyShortage() {
  return { totalGrams: 0n, byBatch: [] as { batchId: string; grams: bigint }[] };
}

describe("computeTripTransitDigest", () => {
  it("нет отгрузок — не «продан», остаток 0", () => {
    const d = computeTripTransitDigest(emptyShipment(), emptySales(), emptyShortage());
    expect(d.hasShipmentToTrip).toBe(false);
    expect(d.remainingNetTransitGrams).toBe(0n);
  });

  it("отгружено и всё продано — остаток 0, есть отгрузка", () => {
    const shipment = {
      totalGrams: 1000n,
      totalPackageCount: 0n,
      byBatch: [{ batchId: "b1", grams: 1000n, packageCount: 0n }],
    };
    const sales = {
      ...emptySales(),
      totalGrams: 1000n,
      byBatch: [
        {
          batchId: "b1",
          grams: 1000n,
          revenueKopecks: 0n,
          cashKopecks: 0n,
          debtKopecks: 0n,
          cardTransferKopecks: 0n,
        },
      ],
    };
    const d = computeTripTransitDigest(shipment, sales, emptyShortage());
    expect(d.hasShipmentToTrip).toBe(true);
    expect(d.remainingNetTransitGrams).toBe(0n);
  });

  it("часть в пути", () => {
    const shipment = {
      totalGrams: 2000n,
      totalPackageCount: 0n,
      byBatch: [{ batchId: "b1", grams: 2000n, packageCount: 0n }],
    };
    const sales = {
      ...emptySales(),
      totalGrams: 500n,
      byBatch: [
        {
          batchId: "b1",
          grams: 500n,
          revenueKopecks: 0n,
          cashKopecks: 0n,
          debtKopecks: 0n,
          cardTransferKopecks: 0n,
        },
      ],
    };
    const d = computeTripTransitDigest(shipment, sales, emptyShortage());
    expect(d.hasShipmentToTrip).toBe(true);
    expect(d.remainingNetTransitGrams).toBe(1500n);
  });
});
