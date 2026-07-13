import { Trip } from "@birzha/domain";
import { describe, expect, it } from "vitest";

import { TripArchiveDeleteRequiresClosedError, TripNotEmptyError } from "../errors.js";
import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";
import { InMemoryTripSaleRepository } from "../testing/in-memory-trip-sale.repository.js";
import { InMemoryTripShipmentRepository } from "../testing/in-memory-trip-shipment.repository.js";
import { InMemoryTripShortageRepository } from "../testing/in-memory-trip-shortage.repository.js";
import { DeleteTripUseCase } from "./delete-trip.use-case.js";

describe("DeleteTripUseCase", () => {
  it("удаляет пустой рейс без fromArchive", async () => {
    const trips = new InMemoryTripRepository();
    await trips.save(Trip.create({ id: "t1", tripNumber: "Ф-1" }));
    const uc = new DeleteTripUseCase(
      trips,
      new InMemoryTripShipmentRepository(),
      new InMemoryTripSaleRepository(),
      new InMemoryTripShortageRepository(),
    );
    await uc.execute("t1");
    expect(await trips.findById("t1")).toBeNull();
  });

  it("без fromArchive отклоняет рейс с отгрузкой", async () => {
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    await trips.save(Trip.create({ id: "t2", tripNumber: "Ф-2" }));
    await shipments.append({ id: "sh1", tripId: "t2", batchId: "b1", grams: 1000n, packageCount: null });
    const uc = new DeleteTripUseCase(
      trips,
      shipments,
      new InMemoryTripSaleRepository(),
      new InMemoryTripShortageRepository(),
    );
    await expect(uc.execute("t2")).rejects.toBeInstanceOf(TripNotEmptyError);
  });

  it("fromArchive удаляет закрытый рейс с движениями", async () => {
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const sales = new InMemoryTripSaleRepository();
    const shortages = new InMemoryTripShortageRepository();
    await trips.save(
      Trip.restore({
        id: "t3",
        tripNumber: "Ф-3",
        status: "closed",
        vehicleLabel: null,
        driverName: null,
        departedAt: null,
        assignedSellerUserId: null,
      }),
    );
    await shipments.append({ id: "sh1", tripId: "t3", batchId: "b1", grams: 1000n, packageCount: null });
    await sales.append({
      id: "sl1",
      tripId: "t3",
      batchId: "b1",
      saleId: "s1",
      grams: 500n,
      pricePerKgKopecks: 100n,
      revenueKopecks: 50n,
      cashKopecks: 50n,
      debtKopecks: 0n,
      cardTransferKopecks: 0n,
      saleChannel: "retail",
    });
    await shortages.append({ id: "shrt1", tripId: "t3", batchId: "b1", grams: 100n, reason: "test" });

    const manifestCleanup = {
      deletedTripIds: [] as string[],
      async deleteManifestsByTripId(tripId: string) {
        this.deletedTripIds.push(tripId);
      },
    };

    const uc = new DeleteTripUseCase(trips, shipments, sales, shortages, manifestCleanup);
    await uc.execute("t3", { fromArchive: true });

    expect(await trips.findById("t3")).toBeNull();
    expect(await shipments.aggregateByTripId("t3")).toMatchObject({ totalGrams: 0n });
    expect(await sales.aggregateByTripId("t3")).toMatchObject({ totalGrams: 0n });
    expect(await shortages.aggregateByTripId("t3")).toMatchObject({ totalGrams: 0n });
    expect(manifestCleanup.deletedTripIds).toEqual(["t3"]);
  });

  it("fromArchive отклоняет открытый рейс", async () => {
    const trips = new InMemoryTripRepository();
    await trips.save(Trip.create({ id: "t4", tripNumber: "Ф-4" }));
    const uc = new DeleteTripUseCase(
      trips,
      new InMemoryTripShipmentRepository(),
      new InMemoryTripSaleRepository(),
      new InMemoryTripShortageRepository(),
    );
    await expect(uc.execute("t4", { fromArchive: true })).rejects.toBeInstanceOf(TripArchiveDeleteRequiresClosedError);
  });
});
