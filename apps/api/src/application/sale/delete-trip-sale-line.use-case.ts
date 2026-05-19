import { TripNotFoundError, TripSaleLineNotFoundError } from "../errors.js";
import type { AuthRoleGrant } from "../../auth/role-grant.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";
import { loadBatchOrThrow } from "../load-batch.js";
import type { SellFromTripTransactionRunner } from "./sell-from-trip.use-case.js";
import { assertMayEditTripSaleLine, assertTripOpenForSaleEdit } from "./trip-sale-edit-guard.js";
import { gramsToKg } from "../../infrastructure/persistence/batch-mass.js";

export type DeleteTripSaleLineInput = {
  lineId: string;
  editorUserId?: string | null;
  editorRoles?: AuthRoleGrant[];
};

export class DeleteTripSaleLineUseCase {
  constructor(
    private readonly batches: BatchRepository,
    private readonly trips: TripRepository,
    private readonly sales: TripSaleRepository,
    private readonly runInTransaction?: SellFromTripTransactionRunner,
  ) {}

  async execute(input: DeleteTripSaleLineInput): Promise<void> {
    const line = await this.sales.findLineById(input.lineId);
    if (!line) {
      throw new TripSaleLineNotFoundError(input.lineId);
    }

    const trip = await this.trips.findById(line.tripId);
    if (!trip) {
      throw new TripNotFoundError(line.tripId);
    }
    assertTripOpenForSaleEdit(trip, line.tripId);
    assertMayEditTripSaleLine({
      trip,
      line,
      editorUserId: input.editorUserId ?? undefined,
      editorRoles: input.editorRoles,
    });

    const kg = gramsToKg(line.grams);

    const persist = async (batches: BatchRepository, saleRepo: TripSaleRepository) => {
      const batch = await loadBatchOrThrow(batches, line.batchId);
      batch.reverseTripSale(kg);
      await batches.save(batch);
      await saleRepo.deleteLineById(line.id);
    };

    if (this.runInTransaction) {
      await this.runInTransaction(persist);
    } else {
      await persist(this.batches, this.sales);
    }
  }
}
