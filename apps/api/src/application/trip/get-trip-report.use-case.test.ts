import { Batch, Trip } from "@birzha/domain";
import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";
import { InMemoryTripSaleRepository } from "../testing/in-memory-trip-sale.repository.js";
import { InMemoryTripShipmentRepository } from "../testing/in-memory-trip-shipment.repository.js";
import { InMemoryTripShortageRepository } from "../testing/in-memory-trip-shortage.repository.js";
import { GetTripReportUseCase } from "./get-trip-report.use-case.js";

describe("GetTripReportUseCase", () => {
  it("возвращает отгрузки и продажи по рейсу", async () => {
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const sales = new InMemoryTripSaleRepository();
    const shortages = new InMemoryTripShortageRepository();
    const batches = new InMemoryBatchRepository();
    await batches.save(
      Batch.create({
        id: "b-a",
        purchaseId: "p-1",
        totalKg: 100,
        pricePerKg: 8,
        distribution: "on_hand",
      }),
    );
    await trips.save(Trip.create({ id: "t-1", tripNumber: "Ф-01" }));
    await shipments.append({
      id: "sh1",
      tripId: "t-1",
      batchId: "b-a",
      grams: 1000n,
      packageCount: null,
    });
    await sales.append({
      id: "sl1",
      tripId: "t-1",
      batchId: "b-a",
      saleId: "s-1",
      grams: 400n,
      pricePerKgKopecks: 1000n,
      revenueKopecks: 400n,
      cashKopecks: 400n,
      debtKopecks: 0n,
    });

    const { trip, shipment, sales: saleAgg, shortage, financials } = await new GetTripReportUseCase(
      trips,
      shipments,
      sales,
      shortages,
      batches,
    ).execute("t-1");

    expect(trip.getId()).toBe("t-1");
    expect(shipment.totalGrams).toBe(1000n);
    expect(shipment.totalPackageCount).toBe(0n);
    expect(saleAgg.totalGrams).toBe(400n);
    expect(saleAgg.totalRevenueKopecks).toBe(400n);
    expect(saleAgg.totalCashKopecks).toBe(400n);
    expect(saleAgg.totalDebtKopecks).toBe(0n);
    expect(saleAgg.byClient).toEqual([
      {
        clientLabel: "",
        grams: 400n,
        revenueKopecks: 400n,
        cashKopecks: 400n,
        debtKopecks: 0n,
      },
    ]);
    expect(shortage.totalGrams).toBe(0n);
    expect(financials.revenueKopecks).toBe(400n);
    expect(financials.costOfSoldKopecks).toBe(320n);
    expect(financials.costOfShortageKopecks).toBe(0n);
    expect(financials.grossProfitKopecks).toBe(80n);
  });

  it("фильтр по recordedByUserId: только чужие строки отсекаются", async () => {
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const sales = new InMemoryTripSaleRepository();
    const shortages = new InMemoryTripShortageRepository();
    const batches = new InMemoryBatchRepository();
    await batches.save(
      Batch.create({
        id: "b-b",
        purchaseId: "p-2",
        totalKg: 200,
        pricePerKg: 4,
        distribution: "on_hand",
      }),
    );
    await trips.save(Trip.create({ id: "t-2", tripNumber: "Ф-99" }));
    await shipments.append({
      id: "sh2",
      tripId: "t-2",
      batchId: "b-b",
      grams: 50_000n,
      packageCount: null,
    });
    const line = (id: string, saleId: string, grams: bigint, rev: bigint, cash: bigint, uid: string) =>
      sales.append({
        id,
        tripId: "t-2",
        batchId: "b-b",
        saleId,
        grams,
        pricePerKgKopecks: 1_000n,
        revenueKopecks: rev,
        cashKopecks: cash,
        debtKopecks: rev - cash,
        recordedByUserId: uid,
      });
    await line("a", "s-a", 10_000n, 1_000n, 1_000n, "u-alice");
    await line("b", "s-b", 5_000n, 2_000n, 2_000n, "u-bob");

    const uc = new GetTripReportUseCase(trips, shipments, sales, shortages, batches);
    const full = await uc.execute("t-2");
    expect(full.sales.totalGrams).toBe(15_000n);

    const forAlice = await uc.execute("t-2", { onlySalesRecordedByUserId: "u-alice" });
    expect(forAlice.sales.totalGrams).toBe(10_000n);
    expect(forAlice.financials.revenueKopecks).toBe(1_000n);

    const forBob = await uc.execute("t-2", { onlySalesRecordedByUserId: "u-bob" });
    expect(forBob.sales.totalGrams).toBe(5_000n);
  });
});
