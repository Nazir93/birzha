import { randomUUID } from "node:crypto";

import { SellerFieldExpenseNotFoundError, TripClosedError, TripNotFoundError } from "../errors.js";
import type {
  SellerFieldExpenseCategory,
  SellerFieldExpenseRecord,
  SellerFieldExpenseRepository,
} from "../ports/seller-field-expense-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";

import {
  cashToHandOver,
  groupSellerFieldExpenses,
  type SellerFieldExpenseGroupMode,
} from "./seller-field-expense-groups.js";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class SellerFieldExpensesUseCase {
  constructor(
    private readonly trips: TripRepository,
    private readonly expenses: SellerFieldExpenseRepository,
    private readonly sales: TripSaleRepository,
  ) {}

  async record(input: {
    tripId: string;
    expenseDate: Date;
    category: SellerFieldExpenseCategory;
    amountKopecks: bigint;
    comment?: string | null;
    recordedByUserId?: string | null;
  }): Promise<SellerFieldExpenseRecord> {
    const trip = await this.trips.findById(input.tripId);
    if (!trip) {
      throw new TripNotFoundError(input.tripId);
    }
    if (trip.getStatus() === "closed") {
      throw new TripClosedError(input.tripId);
    }
    if (input.amountKopecks <= 0n) {
      throw new Error("Сумма траты должна быть положительной");
    }
    const id = randomUUID();
    await this.expenses.append({
      id,
      tripId: input.tripId,
      expenseDate: input.expenseDate,
      category: input.category,
      amountKopecks: input.amountKopecks,
      comment: input.comment,
      recordedByUserId: input.recordedByUserId,
    });
    const row = await this.expenses.findById(id);
    if (!row) {
      throw new SellerFieldExpenseNotFoundError(id);
    }
    return row;
  }

  async list(filter: {
    tripId?: string;
    fromYmd?: string;
    toYmd?: string;
    recordedByUserId?: string;
    group: SellerFieldExpenseGroupMode;
  }) {
    const expenses = await this.expenses.list({
      tripId: filter.tripId,
      fromYmd: filter.fromYmd,
      toYmd: filter.toYmd,
      recordedByUserId: filter.recordedByUserId,
    });
    const groups = groupSellerFieldExpenses(expenses, filter.group);
    let expensesTotal = 0n;
    for (const e of expenses) {
      expensesTotal += e.amountKopecks;
    }

    const tripIds = filter.tripId
      ? [filter.tripId]
      : [...new Set(expenses.map((e) => e.tripId))];
    let cash = 0n;
    let card = 0n;
    let debt = 0n;
    const sellerFilter =
      filter.recordedByUserId != null && filter.recordedByUserId !== ""
        ? { onlyRecordedByUserId: filter.recordedByUserId }
        : undefined;
    for (const tripId of tripIds) {
      const lines = await this.sales.listLinesByTripId(tripId, sellerFilter);
      for (const line of lines) {
        const day = ymd(line.recordedAt);
        if (filter.fromYmd && day < filter.fromYmd) {
          continue;
        }
        if (filter.toYmd && day > filter.toYmd) {
          continue;
        }
        cash += line.cashKopecks;
        card += line.cardTransferKopecks;
        debt += line.debtKopecks;
      }
    }

    return {
      expenses,
      groups,
      settlement: {
        cashKopecks: cash,
        cardTransferKopecks: card,
        debtKopecks: debt,
        fieldExpensesKopecks: expensesTotal,
        cashToHandOverKopecks: cashToHandOver(cash, expensesTotal),
      },
    };
  }

  async delete(input: {
    expenseId: string;
    actorUserId: string | null;
    isAdminLike: boolean;
  }): Promise<void> {
    const row = await this.expenses.findById(input.expenseId);
    if (!row) {
      throw new SellerFieldExpenseNotFoundError(input.expenseId);
    }
    const trip = await this.trips.findById(row.tripId);
    if (!trip) {
      throw new TripNotFoundError(row.tripId);
    }
    if (!input.isAdminLike) {
      if (!input.actorUserId || row.recordedByUserId !== input.actorUserId) {
        throw new SellerFieldExpenseNotFoundError(input.expenseId);
      }
      if (trip.getStatus() === "closed") {
        throw new TripClosedError(row.tripId);
      }
    }
    await this.expenses.deleteById(input.expenseId);
  }
}
