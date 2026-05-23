import { describe, expect, it } from "vitest";

import { InMemoryTripSaleRepository } from "./in-memory-trip-sale.repository.js";

describe("InMemoryTripSaleRepository.listLinesByTripId", () => {
  it("возвращает строки от новых к старым", async () => {
    const repo = new InMemoryTripSaleRepository();
    const base = {
      tripId: "t1",
      batchId: "b1",
      saleId: "s",
      grams: 1000n,
      pricePerKgKopecks: 100n,
      revenueKopecks: 100n,
      cashKopecks: 100n,
      debtKopecks: 0n,
      cardTransferKopecks: 0n,
      saleChannel: "retail" as const,
    };
    await repo.append({
      ...base,
      id: "line-old",
      recordedAt: new Date("2026-05-19T10:00:00Z"),
    });
    await repo.append({
      ...base,
      id: "line-new",
      recordedAt: new Date("2026-05-19T12:00:00Z"),
    });
    await repo.append({
      ...base,
      id: "line-mid",
      recordedAt: new Date("2026-05-19T11:00:00Z"),
    });

    const lines = await repo.listLinesByTripId("t1");
    expect(lines.map((l) => l.id)).toEqual(["line-new", "line-mid", "line-old"]);
  });
});
