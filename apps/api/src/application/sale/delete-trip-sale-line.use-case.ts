import { TripNotFoundError, TripSaleLineNotFoundError } from "../errors.js";
import type { AuthRoleGrant } from "../../auth/role-grant.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";
import { loadBatchForUpdateOrThrow } from "../load-batch.js";
import type { SellFromTripTransactionRunner } from "./sell-from-trip.use-case.js";
import { assertMayEditTripSaleLine, assertTripOpenForSaleEdit } from "./trip-sale-edit-guard.js";
import { gramsToKg } from "../units/mass.js";

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

    const persist = async (ctx: { batches: BatchRepository; sales: TripSaleRepository }) => {
      const batch = await loadBatchForUpdateOrThrow(ctx.batches, line.batchId);
      batch.reverseTripSale(kg);
      await ctx.batches.save(batch);
      await ctx.sales.deleteLineById(line.id);
    };

    if (this.runInTransaction) {
      await this.runInTransaction(async (txCtx) => {
        await persist({ batches: txCtx.batches, sales: txCtx.sales });
      });
    } else {
      await persist({ batches: this.batches, sales: this.sales });
    }
  }
}
