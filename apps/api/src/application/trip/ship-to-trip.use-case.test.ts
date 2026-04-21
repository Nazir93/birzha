import { describe, expect, it } from "vitest";

import { CreatePurchaseUseCase } from "../purchase/create-purchase.use-case.js";
import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";
import { InMemoryTripShipmentRepository } from "../testing/in-memory-trip-shipment.repository.js";
import { TripNotFoundError } from "../errors.js";
import { CreateTripUseCase } from "./create-trip.use-case.js";
import { ShipToTripUseCase } from "./ship-to-trip.use-case.js";

describe("ShipToTripUseCase", () => {
  it("отгружает со склада в рейс", async () => {
    const repo = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    await new CreateTripUseCase(trips).execute({ id: "t-1", tripNumber: "Ф-01" });
    await new CreatePurchaseUseCase(repo).execute({
      id: "b-1",
      purchaseId: "p-1",
      totalKg: 600,
      pricePerKg: 11,
      distribution: "on_hand",
    });

    await new ShipToTripUseCase(repo, trips, shipments).execute({
      batchId: "b-1",
      kg: 200,
      tripId: "t-1",
    });

    const batch = await repo.findById("b-1");
    expect(batch).not.toBeNull();
    expect(batch!.remainingKg()).toBe(600);

    const agg = await shipments.aggregateByTripId("t-1");
    expect(agg.totalGrams).toBe(200_000n);
    expect(agg.totalPackageCount).toBe(0n);
    expect(agg.byBatch).toEqual([{ batchId: "b-1", grams: 200_000n, packageCount: 0n }]);
  });

  it("сохраняет количество ящиков в строке отгрузки", async () => {
    const repo = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    await new CreateTripUseCase(trips).execute({ id: "t-2", tripNumber: "Ф-02" });
    await new CreatePurchaseUseCase(repo).execute({
      id: "b-2",
      purchaseId: "p-1",
      totalKg: 500,
      pricePerKg: 10,
      distribution: "on_hand",
    });

    await new ShipToTripUseCase(repo, trips, shipments).execute({
      batchId: "b-2",
      kg: 100,
      tripId: "t-2",
      packageCount: 42,
    });

    const agg = await shipments.aggregateByTripId("t-2");
    expect(agg.totalPackageCount).toBe(42n);
    expect(agg.byBatch[0]?.packageCount).toBe(42n);
  });

  it("без рейса в репозитории — TripNotFoundError", async () => {
    const repo = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    await new CreatePurchaseUseCase(repo).execute({
      id: "b-x",
      purchaseId: "p-1",
      totalKg: 100,
      pricePerKg: 1,
      distribution: "on_hand",
    });

    await expect(
      new ShipToTripUseCase(repo, trips, shipments).execute({
        batchId: "b-x",
        kg: 10,
        tripId: "missing",
      }),
    ).rejects.toThrow(TripNotFoundError);
  });
});
