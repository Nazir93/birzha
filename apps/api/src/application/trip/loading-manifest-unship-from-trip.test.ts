import { Batch, gramsToKg } from "@birzha/domain";
import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../testing/in-memory-batch.repository.js";
import { InMemoryTripShipmentRepository } from "../testing/in-memory-trip-shipment.repository.js";
import { unshipLoadingManifestBatchesFromTrip } from "./loading-manifest-unship-from-trip.js";

describe("unshipLoadingManifestBatchesFromTrip", () => {
  it("returns mass from transit to warehouse and reduces shipment ledger", async () => {
    const batches = new InMemoryBatchRepository();
    const shipments = new InMemoryTripShipmentRepository();
    const batch = Batch.create({
      id: "b1",
      purchaseId: "p1",
      totalKg: 5000,
      pricePerKg: 10,
      distribution: "on_hand",
    });
    batch.shipToTrip(3000, "trip-1");
    await batches.save(batch);
    await shipments.append({
      id: "sh1",
      tripId: "trip-1",
      batchId: "b1",
      grams: 3_000_000n,
      packageCount: 30n,
    });

    const manifestGramsByBatch = new Map([["b1", { grams: 3_000_000n, packageCount: 30n }]]);
    const shipmentGramsByBatch = new Map([["b1", 3_000_000n]]);

    await unshipLoadingManifestBatchesFromTrip({
      tripId: "trip-1",
      manifestGramsByBatch,
      shipmentGramsByBatch,
      batches,
      shipments,
      reason: "test detach",
    });

    const saved = await batches.findById("b1");
    expect(gramsToKg(saved!.toPersistenceState().onWarehouseGrams)).toBe(5000);
    expect(gramsToKg(saved!.toPersistenceState().inTransitGrams)).toBe(0);
    expect(await shipments.totalGramsForTripAndBatch("trip-1", "b1")).toBe(0n);
  });
});

describe("InMemoryTripShipmentRepository.reduceForTripAndBatch", () => {
  it("partially reduces a shipment row", async () => {
    const shipments = new InMemoryTripShipmentRepository();
    await shipments.append({
      id: "sh1",
      tripId: "trip-1",
      batchId: "b1",
      grams: 2_000_000n,
      packageCount: 20n,
    });
    await shipments.reduceForTripAndBatch("trip-1", "b1", 500_000n, 5n);
    expect(await shipments.totalGramsForTripAndBatch("trip-1", "b1")).toBe(1_500_000n);
  });
});
