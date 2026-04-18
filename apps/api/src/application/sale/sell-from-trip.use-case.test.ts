import { describe, expect, it } from "vitest";

import { CounterpartyNotFoundError, InsufficientStockForTripError, SalePaymentSplitError } from "../errors.js";
import { CreatePurchaseUseCase } from "../purchase/create-purchase.use-case.js";
import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";
import { InMemoryTripSaleRepository } from "../testing/in-memory-trip-sale.repository.js";
import { InMemoryTripShipmentRepository } from "../testing/in-memory-trip-shipment.repository.js";
import { InMemoryTripShortageRepository } from "../testing/in-memory-trip-shortage.repository.js";
import { InMemoryCounterpartyRepository } from "../../infrastructure/persistence/in-memory-counterparty.repository.js";
import { CreateTripUseCase } from "../trip/create-trip.use-case.js";
import { ShipToTripUseCase } from "../trip/ship-to-trip.use-case.js";
import { SellFromTripUseCase } from "./sell-from-trip.use-case.js";

describe("SellFromTripUseCase", () => {
  it("продаёт из рейса и пишет журнал продаж", async () => {
    const repo = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const sales = new InMemoryTripSaleRepository();
    const shortages = new InMemoryTripShortageRepository();
    const counterparties = new InMemoryCounterpartyRepository();
    await new CreateTripUseCase(trips).execute({ id: "t-2", tripNumber: "Ф-02" });
    await new CreatePurchaseUseCase(repo).execute({
      id: "b-1",
      purchaseId: "p-1",
      totalKg: 400,
      pricePerKg: 8,
      distribution: "on_hand",
    });
    await new ShipToTripUseCase(repo, trips, shipments).execute({
      batchId: "b-1",
      kg: 150,
      tripId: "t-2",
    });

    await new SellFromTripUseCase(repo, trips, shipments, sales, shortages, counterparties).execute({
      batchId: "b-1",
      tripId: "t-2",
      kg: 100,
      saleId: "s-1",
      pricePerKg: 10,
    });

    const batch = await repo.findById("b-1");
    expect(batch).not.toBeNull();
    expect(batch!.remainingKg()).toBe(300);
    expect(batch!.totalProcessedKg()).toBe(100);

    const sold = await sales.totalGramsForTripAndBatch("t-2", "b-1");
    expect(sold).toBe(100_000n);
    const agg = await sales.aggregateByTripId("t-2");
    expect(agg.totalRevenueKopecks).toBe(100_000n);
    expect(agg.totalCashKopecks).toBe(100_000n);
    expect(agg.totalDebtKopecks).toBe(0n);
  });

  it("при counterpartyId пишет снимок имени в отчёт по клиентам", async () => {
    const repo = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const sales = new InMemoryTripSaleRepository();
    const shortages = new InMemoryTripShortageRepository();
    const counterparties = new InMemoryCounterpartyRepository();
    const cp = await counterparties.create("  ООО Рога  ");
    await new CreateTripUseCase(trips).execute({ id: "t-cp", tripNumber: "Ф-CP" });
    await new CreatePurchaseUseCase(repo).execute({
      id: "b-cp",
      purchaseId: "p-1",
      totalKg: 100,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    await new ShipToTripUseCase(repo, trips, shipments).execute({
      batchId: "b-cp",
      kg: 20,
      tripId: "t-cp",
    });
    await new SellFromTripUseCase(repo, trips, shipments, sales, shortages, counterparties).execute({
      batchId: "b-cp",
      tripId: "t-cp",
      kg: 5,
      saleId: "s-cp",
      pricePerKg: 2,
      counterpartyId: cp.id,
    });
    const agg = await sales.aggregateByTripId("t-cp");
    expect(agg.byClient.some((c) => c.clientLabel === "ООО Рога")).toBe(true);
  });

  it("неизвестный counterpartyId — ошибка", async () => {
    const repo = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const sales = new InMemoryTripSaleRepository();
    const shortages = new InMemoryTripShortageRepository();
    const counterparties = new InMemoryCounterpartyRepository();
    await new CreateTripUseCase(trips).execute({ id: "t-bad", tripNumber: "Ф-B" });
    await new CreatePurchaseUseCase(repo).execute({
      id: "b-bad",
      purchaseId: "p-1",
      totalKg: 50,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    await new ShipToTripUseCase(repo, trips, shipments).execute({
      batchId: "b-bad",
      kg: 10,
      tripId: "t-bad",
    });
    await expect(
      new SellFromTripUseCase(repo, trips, shipments, sales, shortages, counterparties).execute({
        batchId: "b-bad",
        tripId: "t-bad",
        kg: 1,
        saleId: "s-x",
        pricePerKg: 1,
        counterpartyId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow(CounterpartyNotFoundError);
  });

  it("при paymentKind=debt вся выручка в долг", async () => {
    const repo = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const sales = new InMemoryTripSaleRepository();
    const shortages = new InMemoryTripShortageRepository();
    const counterparties = new InMemoryCounterpartyRepository();
    await new CreateTripUseCase(trips).execute({ id: "t-d", tripNumber: "Ф-D" });
    await new CreatePurchaseUseCase(repo).execute({
      id: "b-d",
      purchaseId: "p-1",
      totalKg: 100,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    await new ShipToTripUseCase(repo, trips, shipments).execute({
      batchId: "b-d",
      kg: 10,
      tripId: "t-d",
    });
    await new SellFromTripUseCase(repo, trips, shipments, sales, shortages, counterparties).execute({
      batchId: "b-d",
      tripId: "t-d",
      kg: 10,
      saleId: "s-d",
      pricePerKg: 5,
      paymentKind: "debt",
    });
    const agg = await sales.aggregateByTripId("t-d");
    expect(agg.totalDebtKopecks).toBe(agg.totalRevenueKopecks);
    expect(agg.totalCashKopecks).toBe(0n);
  });

  it("mixed без cashKopecksMixed — ошибка", async () => {
    const repo = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const sales = new InMemoryTripSaleRepository();
    const shortages = new InMemoryTripShortageRepository();
    const counterparties = new InMemoryCounterpartyRepository();
    await new CreateTripUseCase(trips).execute({ id: "t-m", tripNumber: "Ф-M" });
    await new CreatePurchaseUseCase(repo).execute({
      id: "b-m",
      purchaseId: "p-1",
      totalKg: 50,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    await new ShipToTripUseCase(repo, trips, shipments).execute({
      batchId: "b-m",
      kg: 5,
      tripId: "t-m",
    });
    await expect(
      new SellFromTripUseCase(repo, trips, shipments, sales, shortages, counterparties).execute({
        batchId: "b-m",
        tripId: "t-m",
        kg: 5,
        saleId: "s-m",
        pricePerKg: 2,
        paymentKind: "mixed",
      }),
    ).rejects.toThrow(SalePaymentSplitError);
  });

  it("не продаёт больше, чем отгружено в этот рейс", async () => {
    const repo = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const sales = new InMemoryTripSaleRepository();
    const shortages = new InMemoryTripShortageRepository();
    const counterparties = new InMemoryCounterpartyRepository();
    await new CreateTripUseCase(trips).execute({ id: "t-x", tripNumber: "Ф-X" });
    await new CreatePurchaseUseCase(repo).execute({
      id: "b-x",
      purchaseId: "p-1",
      totalKg: 200,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    await new ShipToTripUseCase(repo, trips, shipments).execute({
      batchId: "b-x",
      kg: 50,
      tripId: "t-x",
    });

    await expect(
      new SellFromTripUseCase(repo, trips, shipments, sales, shortages, counterparties).execute({
        batchId: "b-x",
        tripId: "t-x",
        kg: 60,
        saleId: "s-2",
        pricePerKg: 1,
      }),
    ).rejects.toThrow(InsufficientStockForTripError);
  });
});
