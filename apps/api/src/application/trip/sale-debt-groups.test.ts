import { describe, expect, it } from "vitest";

import { buildSaleDebtGroupsFromLines, filterSaleDebtGroups } from "./sale-debt-groups.js";
import type { TripSaleLineRecord } from "../ports/trip-sale-repository.port.js";

function line(partial: Partial<TripSaleLineRecord> & Pick<TripSaleLineRecord, "saleId" | "tripId" | "debtKopecks">): TripSaleLineRecord {
  return {
    id: partial.id ?? `id-${partial.saleId}`,
    tripId: partial.tripId,
    batchId: partial.batchId ?? "b1",
    saleId: partial.saleId,
    grams: partial.grams ?? 1000n,
    pricePerKgKopecks: partial.pricePerKgKopecks ?? 10000n,
    revenueKopecks: partial.revenueKopecks ?? partial.debtKopecks,
    cashKopecks: partial.cashKopecks ?? 0n,
    debtKopecks: partial.debtKopecks,
    cardTransferKopecks: partial.cardTransferKopecks ?? 0n,
    saleChannel: partial.saleChannel ?? "retail",
    clientLabel: partial.clientLabel ?? "Клиент",
    counterpartyId: partial.counterpartyId ?? null,
    wholesaleBuyerId: partial.wholesaleBuyerId ?? null,
    recordedByUserId: partial.recordedByUserId ?? null,
    packageCount: partial.packageCount ?? null,
    recordedAt: partial.recordedAt ?? new Date("2026-10-01T12:00:00.000Z"),
  };
}

describe("sale-debt-groups", () => {
  it("filterSaleDebtGroups по tripId", () => {
    const groups = buildSaleDebtGroupsFromLines([
      line({ saleId: "s1", tripId: "t1", debtKopecks: 1000n }),
      line({ saleId: "s2", tripId: "t2", debtKopecks: 2000n }),
    ]);
    expect(filterSaleDebtGroups(groups, { tripId: "t1" }).map((g) => g.saleId)).toEqual(["s1"]);
  });
});
