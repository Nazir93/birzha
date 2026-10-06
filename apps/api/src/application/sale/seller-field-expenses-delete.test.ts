import { describe, expect, it } from "vitest";
import { Trip } from "@birzha/domain";

import { SellerFieldExpenseNotFoundError, TripClosedError } from "../errors.js";
import { InMemorySellerFieldExpenseRepository } from "../testing/in-memory-seller-field-expense.repository.js";
import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";
import { InMemoryTripSaleRepository } from "../testing/in-memory-trip-sale.repository.js";
import { SellerFieldExpensesUseCase } from "./seller-field-expenses.use-case.js";

describe("SellerFieldExpensesUseCase.delete", () => {
  async function setup() {
    const trips = new InMemoryTripRepository();
    const expenses = new InMemorySellerFieldExpenseRepository();
    const sales = new InMemoryTripSaleRepository();
    await trips.save(
      Trip.create({ id: "t1", tripNumber: "01", assignedSellerUserId: "seller-1" }),
    );
    const uc = new SellerFieldExpensesUseCase(trips, expenses, sales);
    const row = await uc.record({
      tripId: "t1",
      expenseDate: new Date("2026-09-15T12:00:00.000Z"),
      category: "rent",
      amountKopecks: 15_000_000n,
      comment: "бронь",
      recordedByUserId: "other-user",
    });
    return { uc, trips, expenses, row };
  }

  it("закреплённый продавец удаляет чужую запись на своём открытом рейсе", async () => {
    const { uc, row } = await setup();
    await uc.delete({
      expenseId: row.id,
      actorUserId: "seller-1",
      isAdminLike: false,
      isAssignedFieldSeller: true,
    });
    await expect(
      uc.delete({
        expenseId: row.id,
        actorUserId: "seller-1",
        isAdminLike: false,
        isAssignedFieldSeller: true,
      }),
    ).rejects.toBeInstanceOf(SellerFieldExpenseNotFoundError);
  });

  it("чужой продавец не удаляет", async () => {
    const { uc, row } = await setup();
    await expect(
      uc.delete({
        expenseId: row.id,
        actorUserId: "seller-2",
        isAdminLike: false,
        isAssignedFieldSeller: true,
      }),
    ).rejects.toBeInstanceOf(SellerFieldExpenseNotFoundError);
  });

  it("на закрытом рейсе полевой продавец не удаляет", async () => {
    const { uc, trips, row } = await setup();
    const trip = await trips.findById("t1");
    trip!.close();
    await trips.save(trip!);
    await expect(
      uc.delete({
        expenseId: row.id,
        actorUserId: "seller-1",
        isAdminLike: false,
        isAssignedFieldSeller: true,
      }),
    ).rejects.toBeInstanceOf(TripClosedError);
  });
});
