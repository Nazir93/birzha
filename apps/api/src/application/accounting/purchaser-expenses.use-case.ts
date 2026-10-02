import { InvalidPaymentAmountError } from "@birzha/domain";
import { randomUUID } from "node:crypto";

import { PurchaserExpenseNotFoundError } from "../errors.js";
import type {
  PurchaserExpenseCategory,
  PurchaserExpenseRecord,
  PurchaserExpenseRepository,
} from "../ports/purchaser-expense-repository.port.js";

export class PurchaserExpensesUseCase {
  constructor(private readonly expenses: PurchaserExpenseRepository) {}

  async list(filter: { fromYmd?: string; toYmd?: string; purchaserUserId?: string }) {
    const rows = await this.expenses.list(filter);
    let totalKopecks = 0n;
    let salaryKopecks = 0n;
    let otherKopecks = 0n;
    for (const r of rows) {
      totalKopecks += r.amountKopecks;
      if (r.category === "salary") {
        salaryKopecks += r.amountKopecks;
      } else {
        otherKopecks += r.amountKopecks;
      }
    }
    return { totalKopecks, salaryKopecks, otherKopecks, expenses: rows };
  }

  async record(input: {
    expenseDate: Date;
    category: PurchaserExpenseCategory;
    amountKopecks: bigint;
    purchaserUserId?: string | null;
    purchaserLabel?: string | null;
    comment?: string | null;
    recordedByUserId?: string | null;
  }): Promise<PurchaserExpenseRecord> {
    if (input.amountKopecks <= 0n) {
      throw new InvalidPaymentAmountError(input.amountKopecks);
    }
    const id = randomUUID();
    await this.expenses.append({
      id,
      expenseDate: input.expenseDate,
      category: input.category,
      amountKopecks: input.amountKopecks,
      purchaserUserId: input.purchaserUserId,
      purchaserLabel: input.purchaserLabel,
      comment: input.comment,
      recordedByUserId: input.recordedByUserId,
    });
    const row = await this.expenses.findById(id);
    if (!row) {
      throw new PurchaserExpenseNotFoundError(id);
    }
    return row;
  }

  async delete(expenseId: string): Promise<void> {
    const row = await this.expenses.findById(expenseId);
    if (!row) {
      throw new PurchaserExpenseNotFoundError(expenseId);
    }
    await this.expenses.deleteById(expenseId);
  }
}
