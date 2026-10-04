import { InvalidPaymentAmountError } from "@birzha/domain";
import { randomUUID } from "node:crypto";

import { TripExpenseNotFoundError, TripNotFoundError } from "../errors.js";
import type { TripExpenseCategory, TripExpenseRepository } from "../ports/trip-expense-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";

export class AccountingTripExpensesUseCase {
  constructor(
    private readonly trips: TripRepository,
    private readonly expenses: TripExpenseRepository,
  ) {}

  async list(tripId: string) {
    const trip = await this.trips.findById(tripId);
    if (!trip) {
      throw new TripNotFoundError(tripId);
    }
    const rows = await this.expenses.listByTripId(tripId);
    const totalKopecks = rows.reduce((a, r) => a + r.amountKopecks, 0n);
    return { tripId, tripNumber: trip.getTripNumber(), totalKopecks, expenses: rows };
  }

  async listPeriod(fromYmd: string, toYmd: string) {
    const rows = await this.expenses.listInPeriod(fromYmd, toYmd);
    const tripNumberById = new Map<string, string>();
    for (const row of rows) {
      if (tripNumberById.has(row.tripId)) {
        continue;
      }
      const trip = await this.trips.findById(row.tripId);
      tripNumberById.set(row.tripId, trip ? trip.getTripNumber() : row.tripId);
    }
    const totalKopecks = rows.reduce((a, r) => a + r.amountKopecks, 0n);
    return {
      fromYmd,
      toYmd,
      totalKopecks,
      expenses: rows.map((e) => ({
        ...e,
        tripNumber: tripNumberById.get(e.tripId) ?? e.tripId,
      })),
    };
  }

  async record(input: {
    tripId: string;
    category: TripExpenseCategory;
    amountKopecks: bigint;
    expenseDate: Date;
    comment?: string | null;
    recordedByUserId?: string | null;
  }) {
    const trip = await this.trips.findById(input.tripId);
    if (!trip) {
      throw new TripNotFoundError(input.tripId);
    }
    if (input.amountKopecks <= 0n) {
      throw new InvalidPaymentAmountError(input.amountKopecks);
    }
    const id = randomUUID();
    await this.expenses.append({
      id,
      tripId: input.tripId,
      category: input.category,
      amountKopecks: input.amountKopecks,
      expenseDate: input.expenseDate,
      comment: input.comment,
      recordedByUserId: input.recordedByUserId,
    });
    return { expenseId: id };
  }

  async delete(expenseId: string): Promise<void> {
    const row = await this.expenses.findById(expenseId);
    if (!row) {
      throw new TripExpenseNotFoundError(expenseId);
    }
    await this.expenses.deleteById(expenseId);
  }
}
