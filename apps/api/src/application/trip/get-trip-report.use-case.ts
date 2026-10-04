import { TripNotFoundError } from "../errors.js";
import { loadBatchOrThrow } from "../load-batch.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { DebtPaymentRepository } from "../ports/debt-payment-repository.port.js";
import type { SellerFieldExpenseRepository } from "../ports/seller-field-expense-repository.port.js";
import type { TripExpenseRepository } from "../ports/trip-expense-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../ports/trip-shortage-repository.port.js";

import { computeTripFinancials } from "./trip-financials.js";

export class GetTripReportUseCase {
  constructor(
    private readonly trips: TripRepository,
    private readonly shipments: TripShipmentRepository,
    private readonly sales: TripSaleRepository,
    private readonly shortages: TripShortageRepository,
    private readonly batches: BatchRepository,
    private readonly debtPayments?: DebtPaymentRepository | null,
    private readonly tripExpenses?: TripExpenseRepository | null,
    private readonly sellerFieldExpenses?: SellerFieldExpenseRepository | null,
  ) {}

  /**
   * @param onlySalesRecordedByUserId — если задан, блок `sales` и `financials` (через продажи) только по строкам, записанным этим пользователем (полевой «только seller»). Дополнительно возвращается `salesForTripStock` — все продажи по рейсу для расчёта физического остатка в машине (отгрузка − продано − недостача).
   */
  async execute(
    tripId: string,
    options?: { onlySalesRecordedByUserId?: string },
  ) {
    const trip = await this.trips.findById(tripId);
    if (!trip) {
      throw new TripNotFoundError(tripId);
    }
    const shipment = await this.shipments.aggregateByTripId(tripId);
    const uid = options?.onlySalesRecordedByUserId?.trim();
    const salesAll = await this.sales.aggregateByTripId(tripId);
    const sales = uid
      ? await this.sales.aggregateByTripId(tripId, { onlyRecordedByUserId: uid })
      : salesAll;
    const salesForTripStock = uid ? salesAll : undefined;
    const shortage = await this.shortages.aggregateByTripId(tripId);

    const batchIds = new Set<string>();
    for (const l of sales.byBatch) {
      batchIds.add(l.batchId);
    }
    for (const l of shortage.byBatch) {
      batchIds.add(l.batchId);
    }
    const purchaseRubPerKgByBatchId = new Map<string, number>();
    for (const id of batchIds) {
      const batch = await loadBatchOrThrow(this.batches, id);
      purchaseRubPerKgByBatchId.set(id, batch.getPricePerKg());
    }
    const debtPaidKopecks = this.debtPayments
      ? await this.debtPayments.sumPaidByTripId(tripId)
      : 0n;
    const expensesKopecks = this.tripExpenses
      ? await this.tripExpenses.sumByTripId(tripId)
      : 0n;
    const fieldExpenseRows = this.sellerFieldExpenses
      ? await this.sellerFieldExpenses.list({ tripId })
      : [];
    const fieldExpensesKopecks = fieldExpenseRows.reduce((acc, row) => acc + row.amountKopecks, 0n);
    const financials = computeTripFinancials(sales, shortage, purchaseRubPerKgByBatchId, {
      debtPaidKopecks,
      expensesKopecks,
      fieldExpensesKopecks,
    });

    return { trip, shipment, sales, salesForTripStock, shortage, financials, fieldExpenses: fieldExpenseRows };
  }
}
