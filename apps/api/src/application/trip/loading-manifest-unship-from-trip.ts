import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { TripShipmentRepository } from "../ports/trip-shipment-repository.port.js";
import { loadBatchOrThrow } from "../load-batch.js";
import { gramsToKg } from "../../infrastructure/persistence/batch-mass.js";
import { planLoadingManifestDetachTripReverse } from "./plan-loading-manifest-detach-trip-reverse.js";

export type ManifestBatchGrams = {
  grams: bigint;
  packageCount: bigint | null;
};

/** Вернуть массу ПН с рейса на склад и уменьшить журнал отгрузок. */
export async function unshipLoadingManifestBatchesFromTrip(input: {
  tripId: string;
  manifestGramsByBatch: ReadonlyMap<string, ManifestBatchGrams>;
  shipmentGramsByBatch: ReadonlyMap<string, bigint>;
  batches: BatchRepository;
  shipments: TripShipmentRepository;
  reason: string;
}): Promise<void> {
  for (const [batchId, manifest] of input.manifestGramsByBatch) {
    const reverse = planLoadingManifestDetachTripReverse({
      manifestGrams: manifest.grams,
      manifestPackageCount: manifest.packageCount,
      shipmentGramsOnTrip: input.shipmentGramsByBatch.get(batchId) ?? 0n,
    });
    if (reverse.grams <= 0n) {
      continue;
    }
    const batch = await loadBatchOrThrow(input.batches, batchId);
    batch.receiveBack(gramsToKg(reverse.grams), input.reason);
    await input.batches.save(batch);
    await input.shipments.reduceForTripAndBatch(
      input.tripId,
      batchId,
      reverse.grams,
      reverse.packageCount,
    );
  }
}
