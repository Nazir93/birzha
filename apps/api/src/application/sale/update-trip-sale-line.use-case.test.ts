import { Batch, Trip } from "@birzha/domain";
import { describe, expect, it } from "vitest";

import { TripSaleEditForbiddenError } from "../errors.js";
import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { InMemoryTripSaleRepository } from "../testing/in-memory-trip-sale.repository.js";
import { InMemoryTripShipmentRepository } from "../testing/in-memory-trip-shipment.repository.js";
import { InMemoryTripShortageRepository } from "../testing/in-memory-trip-shortage.repository.js";
import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";
import { InMemoryCounterpartyRepository } from "../../infrastructure/persistence/in-memory-counterparty.repository.js";
import { InMemoryWholesalerRepository } from "../../infrastructure/persistence/in-memory-wholesaler.repository.js";

import { UpdateTripSaleLineUseCase } from "./update-trip-sale-line.use-case.js";

describe("UpdateTripSaleLineUseCase", () => {
  it("меняет кг и выручку по открытому рейсу", async () => {
    const trips = new InMemoryTripRepository();
    const trip = Trip.create({ id: "t1", tripNumber: "1", assignedSellerUserId: "u1" });
    await trips.save(trip);

    const batches = new InMemoryBatchRepository();
    const batch = Batch.create({
      id: "b1",
      purchaseId: "p1",
      totalKg: 100,
      pricePerKg: 10,
      distribution: "on_hand",
    });
    batch.shipToTrip(50, "t1");
    batch.sellFromTrip(20, "s1");
    await batches.save(batch);

    const shipments = new InMemoryTripShipmentRepository();
    await shipments.append({
      id: "sh1",
      tripId: "t1",
      batchId: "b1",
      grams: 50_000n,
      packageCount: null,
    });

    const sales = new InMemoryTripSaleRepository();
    await sales.append({
      id: "line1",
      tripId: "t1",
      batchId: "b1",
      saleId: "s1",
      grams: 20_000n,
      pricePerKgKopecks: 1000n,
      revenueKopecks: 20_000n,
      cashKopecks: 20_000n,
      debtKopecks: 0n,
      cardTransferKopecks: 0n,
      saleChannel: "retail",
      recordedByUserId: "u1",
    });

    const uc = new UpdateTripSaleLineUseCase(
      batches,
      trips,
      shipments,
      sales,
      new InMemoryTripShortageRepository(),
      new InMemoryCounterpartyRepository(),
      new InMemoryWholesalerRepository(),
    );

    await uc.execute({
      lineId: "line1",
      kg: 25,
      pricePerKg: 12,
      editorUserId: "u1",
      editorRoles: [{ roleCode: "seller", scopeType: "global", scopeId: "" }],
    });

    const line = await sales.findLineById("line1");
    expect(line?.grams).toBe(25_000n);
    const saved = await batches.findById("b1");
    expect(saved?.toPersistenceState().soldKg).toBe(25);
    expect(saved?.toPersistenceState().inTransitKg).toBe(25);
  });

  it("меняет канал на опт и подставляет имя оптовика", async () => {
    const trips = new InMemoryTripRepository();
    const trip = Trip.create({ id: "t1", tripNumber: "1", assignedSellerUserId: "u1" });
    await trips.save(trip);

    const batches = new InMemoryBatchRepository();
    const batch = Batch.create({
      id: "b1",
      purchaseId: "p1",
      totalKg: 100,
      pricePerKg: 10,
      distribution: "on_hand",
    });
    batch.shipToTrip(50, "t1");
    batch.sellFromTrip(10, "s1");
    await batches.save(batch);

    const shipments = new InMemoryTripShipmentRepository();
    await shipments.append({
      id: "sh1",
      tripId: "t1",
      batchId: "b1",
      grams: 50_000n,
      packageCount: null,
    });

    const sales = new InMemoryTripSaleRepository();
    await sales.append({
      id: "line1",
      tripId: "t1",
      batchId: "b1",
      saleId: "s1",
      grams: 10_000n,
      pricePerKgKopecks: 1000n,
      revenueKopecks: 10_000n,
      cashKopecks: 10_000n,
      debtKopecks: 0n,
      cardTransferKopecks: 0n,
      saleChannel: "retail",
      recordedByUserId: "u1",
    });

    const wholesalers = new InMemoryWholesalerRepository();
    const w = await wholesalers.create("ООО Опт");

    const uc = new UpdateTripSaleLineUseCase(
      batches,
      trips,
      shipments,
      sales,
      new InMemoryTripShortageRepository(),
      new InMemoryCounterpartyRepository(),
      wholesalers,
    );

    await uc.execute({
      lineId: "line1",
      kg: 10,
      pricePerKg: 12,
      saleChannel: "wholesale",
      wholesaleBuyerId: w.id,
      editorUserId: "u1",
      editorRoles: [{ roleCode: "seller", scopeType: "global", scopeId: "" }],
    });

    const line = await sales.findLineById("line1");
    expect(line?.saleChannel).toBe("wholesale");
    expect(line?.wholesaleBuyerId).toBe(w.id);
    expect(line?.clientLabel).toBe("ООО Опт");
  });

  it("отклоняет правку при закрытом рейсе", async () => {
    const trips = new InMemoryTripRepository();
    const trip = Trip.create({ id: "t1", tripNumber: "1" });
    trip.close();
    await trips.save(trip);

    const sales = new InMemoryTripSaleRepository();
    await sales.append({
      id: "line1",
      tripId: "t1",
      batchId: "b1",
      saleId: "s1",
      grams: 1_000n,
      pricePerKgKopecks: 100n,
      revenueKopecks: 100n,
      cashKopecks: 100n,
      debtKopecks: 0n,
      cardTransferKopecks: 0n,
      saleChannel: "retail",
    });

    const uc = new UpdateTripSaleLineUseCase(
      new InMemoryBatchRepository(),
      trips,
      new InMemoryTripShipmentRepository(),
      sales,
      new InMemoryTripShortageRepository(),
      new InMemoryCounterpartyRepository(),
      new InMemoryWholesalerRepository(),
    );

    await expect(
      uc.execute({ lineId: "line1", kg: 2, pricePerKg: 10 }),
    ).rejects.toThrow(TripSaleEditForbiddenError);
  });
});
