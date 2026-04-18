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
});
