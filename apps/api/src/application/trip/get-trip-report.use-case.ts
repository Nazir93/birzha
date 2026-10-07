import { Obligation } from "@birzha/domain";

import { TripNotFoundError } from "../errors.js";
import { loadBatchOrThrow } from "../load-batch.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { DebtPaymentRepository } from "../ports/debt-payment-repository.port.js";
import type { PurchaserExpenseRepository } from "../ports/purchaser-expense-repository.port.js";
import type { SellerFieldExpenseRepository } from "../ports/seller-field-expense-repository.port.js";
import type { TripExpenseRepository } from "../ports/trip-expense-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleDebtGroup, TripSaleRepository } from "../ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../ports/trip-shortage-repository.port.js";

import { buildSaleDebtGroupsFromLines } from "./sale-debt-groups.js";
import { computeTripFinancials } from "./trip-financials.js";

/** Id погрузочных, привязанных к рейсу (для расходов закупщика). */
export type ListLoadingManifestIdsByTripId = (tripId: string) => Promise<string[]>;

export type TripDebtReceivableRow = {
  saleId: string;
  clientLabel: string | null;
  debtKopecks: bigint;
  paidKopecks: bigint;
  remainingKopecks: bigint;
  status: "open" | "closed";
  soldAt: Date;
};

function buildDebtReceivableRows(
  groups: TripSaleDebtGroup[],
  paidMap: Map<string, bigint>,
): TripDebtReceivableRow[] {
  return groups.map((g) => {
    const paid = paidMap.get(g.saleId) ?? 0n;
    const obl = Obligation.restore({ debtKopecks: g.debtKopecks, paidKopecks: paid });
    const remaining = obl.remainingKopecks();
    return {
      saleId: g.saleId,
      clientLabel: g.clientLabel,
      debtKopecks: g.debtKopecks,
      paidKopecks: paid,
      remainingKopecks: remaining,
      status: (remaining === 0n ? "closed" : "open") as "open" | "closed",
      soldAt: g.firstRecordedAt,
    };
  });
}

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
    private readonly purchaserExpenses?: PurchaserExpenseRepository | null,
    private readonly listLoadingManifestIdsByTripId?: ListLoadingManifestIdsByTripId | null,
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

    const debtLines = await this.sales.listLinesByTripId(
      tripId,
      uid ? { onlyRecordedByUserId: uid } : undefined,
    );
    const debtGroups = buildSaleDebtGroupsFromLines(debtLines);
    const paidMap =
      this.debtPayments && debtGroups.length > 0
        ? await this.debtPayments.sumPaidBySaleIds(debtGroups.map((g) => g.saleId))
        : new Map<string, bigint>();
    const debtReceivables = buildDebtReceivableRows(debtGroups, paidMap);
    const debtPaidKopecks = debtReceivables.reduce((acc, row) => acc + row.paidKopecks, 0n);

    const tripExpensesKopecks = this.tripExpenses
      ? await this.tripExpenses.sumByTripId(tripId)
      : 0n;
    let purchaserExpensesOnManifestsKopecks = 0n;
    if (this.purchaserExpenses && this.listLoadingManifestIdsByTripId) {
      const manifestIds = await this.listLoadingManifestIdsByTripId(tripId);
      purchaserExpensesOnManifestsKopecks =
        await this.purchaserExpenses.sumByLoadingManifestIds(manifestIds);
    }
    const expensesKopecks = tripExpensesKopecks + purchaserExpensesOnManifestsKopecks;
    const fieldExpenseRows = this.sellerFieldExpenses
      ? await this.sellerFieldExpenses.list({ tripId })
      : [];
    const fieldExpensesKopecks = fieldExpenseRows.reduce((acc, row) => acc + row.amountKopecks, 0n);
    const financials = computeTripFinancials(sales, shortage, purchaseRubPerKgByBatchId, {
      debtPaidKopecks,
      expensesKopecks,
      fieldExpensesKopecks,
    });

    return {
      trip,
      shipment,
      sales,
      salesForTripStock,
      shortage,
      financials,
      fieldExpenses: fieldExpenseRows,
      debtReceivables,
    };
  }
}
