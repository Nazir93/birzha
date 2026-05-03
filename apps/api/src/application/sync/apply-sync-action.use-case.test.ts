import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { InMemorySyncIdempotencyRepository } from "../testing/in-memory-sync-idempotency.repository.js";
import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";
import { InMemoryTripSaleRepository } from "../testing/in-memory-trip-sale.repository.js";
import { InMemoryTripShipmentRepository } from "../testing/in-memory-trip-shipment.repository.js";
import { InMemoryTripShortageRepository } from "../testing/in-memory-trip-shortage.repository.js";
import { InMemoryCounterpartyRepository } from "../../infrastructure/persistence/in-memory-counterparty.repository.js";
import { CreatePurchaseUseCase } from "../purchase/create-purchase.use-case.js";
import { CreateTripUseCase } from "../trip/create-trip.use-case.js";
import { ShipToTripUseCase } from "../trip/ship-to-trip.use-case.js";

import { ApplySyncActionUseCase } from "./apply-sync-action.use-case.js";

describe("ApplySyncActionUseCase", () => {
  it("повтор с тем же ключом не выполняет use case снова", async () => {
    const batches = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const sales = new InMemoryTripSaleRepository();
    const shortages = new InMemoryTripShortageRepository();
    const counterparties = new InMemoryCounterpartyRepository();
    const idem = new InMemorySyncIdempotencyRepository();

    await new CreateTripUseCase(trips).execute({ id: "t1", tripNumber: "Ф-1" });
    await new CreatePurchaseUseCase(batches).execute({
      id: "b1",
      purchaseId: "p",
      totalKg: 200,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    await new ShipToTripUseCase(batches, trips, shipments).execute({
      batchId: "b1",
      kg: 50,
      tripId: "t1",
    });

    const uc = new ApplySyncActionUseCase(
      idem,
      batches,
      trips,
      shipments,
      sales,
      shortages,
      counterparties,
    );

    const req = {
      deviceId: "dev",
      localActionId: "loc-1",
      actionType: "sell_from_trip" as const,
      payload: {
        batchId: "b1",
        tripId: "t1",
        kg: 10,
        saleId: "s1",
        pricePerKg: 2,
      },
    };

    const r1 = await uc.execute(req);
    expect(r1).toEqual({ status: "ok", actionId: "loc-1" });

    const r2 = await uc.execute(req);
    expect(r2).toEqual({ status: "ok", actionId: "loc-1", duplicate: true });

    const sold = await sales.totalGramsForTripAndBatch("t1", "b1");
    expect(sold).toBe(10_000n);
  });

  it("seller sync не продаёт с неназначенного рейса", async () => {
    const batches = new InMemoryBatchRepository();
    const trips = new InMemoryTripRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const sales = new InMemoryTripSaleRepository();
    const shortages = new InMemoryTripShortageRepository();
    const counterparties = new InMemoryCounterpartyRepository();
    const idem = new InMemorySyncIdempotencyRepository();

    await new CreateTripUseCase(trips).execute({ id: "t-unassigned", tripNumber: "Ф-U" });
    await new CreatePurchaseUseCase(batches).execute({
      id: "b-u",
      purchaseId: "p-u",
      totalKg: 100,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    await new ShipToTripUseCase(batches, trips, shipments).execute({
      batchId: "b-u",
      kg: 10,
      tripId: "t-unassigned",
    });

    const uc = new ApplySyncActionUseCase(idem, batches, trips, shipments, sales, shortages, counterparties);
    const res = await uc.execute(
      {
        deviceId: "dev-seller",
        localActionId: "loc-seller",
        actionType: "sell_from_trip",
        payload: {
          batchId: "b-u",
          tripId: "t-unassigned",
          kg: 1,
          saleId: "s-u",
          pricePerKg: 1,
        },
      },
      { recordedByUserId: "seller-1", roles: [{ roleCode: "seller", scopeType: "global", scopeId: "" }] },
    );

    expect(res.status).toBe("rejected");
    if (res.status === "rejected") {
      expect(res.errorCode).toBe("sync_forbidden");
    }
    expect(await sales.totalGramsForTripAndBatch("t-unassigned", "b-u")).toBe(0n);
  });
});
