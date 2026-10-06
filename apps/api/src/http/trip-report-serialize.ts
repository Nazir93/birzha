import type { TripFinancials } from "../application/trip/trip-financials.js";
import type { TripSaleAggregate } from "../application/ports/trip-sale-repository.port.js";
import type { TripShipmentAggregate } from "../application/ports/trip-shipment-repository.port.js";
import { calendarYmdFromDate } from "../format/calendar-date.js";

/** Агрегат недостачи (масса и ящики по партиям). */
export type LedgerAggregateJson = {
  totalGrams: string;
  totalPackageCount: string;
  byBatch: { batchId: string; grams: string; packageCount: string }[];
};

export function ledgerAggregateToJson(aggregate: {
  totalGrams: bigint;
  totalPackageCount?: bigint;
  byBatch: { batchId: string; grams: bigint; packageCount?: bigint }[];
}): LedgerAggregateJson {
  return {
    totalGrams: aggregate.totalGrams.toString(),
    totalPackageCount: (aggregate.totalPackageCount ?? 0n).toString(),
    byBatch: aggregate.byBatch.map((l) => ({
      batchId: l.batchId,
      grams: l.grams.toString(),
      packageCount: (l.packageCount ?? 0n).toString(),
    })),
  };
}

/** Отгрузка в рейс: масса и опционально ящики по строкам и суммарно. */
export type ShipmentLedgerJson = {
  totalGrams: string;
  totalPackageCount: string;
  byBatch: { batchId: string; grams: string; packageCount: string }[];
};

export function shipmentLedgerToJson(aggregate: TripShipmentAggregate): ShipmentLedgerJson {
  return {
    totalGrams: aggregate.totalGrams.toString(),
    totalPackageCount: aggregate.totalPackageCount.toString(),
    byBatch: aggregate.byBatch.map((l) => ({
      batchId: l.batchId,
      grams: l.grams.toString(),
      packageCount: l.packageCount.toString(),
    })),
  };
}

/** Продажи: масса + выручка в копейках (строки). */
export type SaleLedgerAggregateJson = {
  totalGrams: string;
  totalPackageCount: string;
  totalRevenueKopecks: string;
  totalCashKopecks: string;
  totalDebtKopecks: string;
  totalCardTransferKopecks: string;
  retailGrams: string;
  wholesaleGrams: string;
  retailRevenueKopecks: string;
  wholesaleRevenueKopecks: string;
  retailCashKopecks: string;
  retailDebtKopecks: string;
  retailCardTransferKopecks: string;
  wholesaleCashKopecks: string;
  wholesaleDebtKopecks: string;
  wholesaleCardTransferKopecks: string;
  byBatch: {
    batchId: string;
    grams: string;
    packageCount: string;
    revenueKopecks: string;
    cashKopecks: string;
    debtKopecks: string;
    cardTransferKopecks: string;
  }[];
  byClient: {
    clientLabel: string;
    grams: string;
    revenueKopecks: string;
    cashKopecks: string;
    debtKopecks: string;
    cardTransferKopecks: string;
  }[];
  retailByBatch: SaleLedgerAggregateJson["byBatch"];
  wholesaleByBatch: SaleLedgerAggregateJson["byBatch"];
  retailByClient: SaleLedgerAggregateJson["byClient"];
  wholesaleByClient: SaleLedgerAggregateJson["byClient"];
};

export function saleLedgerAggregateToJson(aggregate: TripSaleAggregate): SaleLedgerAggregateJson {
  return {
    totalGrams: aggregate.totalGrams.toString(),
    totalPackageCount: aggregate.totalPackageCount.toString(),
    totalRevenueKopecks: aggregate.totalRevenueKopecks.toString(),
    totalCashKopecks: aggregate.totalCashKopecks.toString(),
    totalDebtKopecks: aggregate.totalDebtKopecks.toString(),
    totalCardTransferKopecks: aggregate.totalCardTransferKopecks.toString(),
    retailGrams: aggregate.retailGrams.toString(),
    wholesaleGrams: aggregate.wholesaleGrams.toString(),
    retailRevenueKopecks: aggregate.retailRevenueKopecks.toString(),
    wholesaleRevenueKopecks: aggregate.wholesaleRevenueKopecks.toString(),
    retailCashKopecks: aggregate.retailCashKopecks.toString(),
    retailDebtKopecks: aggregate.retailDebtKopecks.toString(),
    retailCardTransferKopecks: aggregate.retailCardTransferKopecks.toString(),
    wholesaleCashKopecks: aggregate.wholesaleCashKopecks.toString(),
    wholesaleDebtKopecks: aggregate.wholesaleDebtKopecks.toString(),
    wholesaleCardTransferKopecks: aggregate.wholesaleCardTransferKopecks.toString(),
    byBatch: aggregate.byBatch.map((l) => ({
      batchId: l.batchId,
      grams: l.grams.toString(),
      packageCount: l.packageCount.toString(),
      revenueKopecks: l.revenueKopecks.toString(),
      cashKopecks: l.cashKopecks.toString(),
      debtKopecks: l.debtKopecks.toString(),
      cardTransferKopecks: l.cardTransferKopecks.toString(),
    })),
    byClient: aggregate.byClient.map((l) => ({
      clientLabel: l.clientLabel,
      grams: l.grams.toString(),
      packageCount: l.packageCount.toString(),
      revenueKopecks: l.revenueKopecks.toString(),
      cashKopecks: l.cashKopecks.toString(),
      debtKopecks: l.debtKopecks.toString(),
      cardTransferKopecks: l.cardTransferKopecks.toString(),
    })),
    retailByBatch: aggregate.retailByBatch.map((l) => ({
      batchId: l.batchId,
      grams: l.grams.toString(),
      packageCount: l.packageCount.toString(),
      revenueKopecks: l.revenueKopecks.toString(),
      cashKopecks: l.cashKopecks.toString(),
      debtKopecks: l.debtKopecks.toString(),
      cardTransferKopecks: l.cardTransferKopecks.toString(),
    })),
    wholesaleByBatch: aggregate.wholesaleByBatch.map((l) => ({
      batchId: l.batchId,
      grams: l.grams.toString(),
      packageCount: l.packageCount.toString(),
      revenueKopecks: l.revenueKopecks.toString(),
      cashKopecks: l.cashKopecks.toString(),
      debtKopecks: l.debtKopecks.toString(),
      cardTransferKopecks: l.cardTransferKopecks.toString(),
    })),
    retailByClient: aggregate.retailByClient.map((l) => ({
      clientLabel: l.clientLabel,
      grams: l.grams.toString(),
      packageCount: l.packageCount.toString(),
      revenueKopecks: l.revenueKopecks.toString(),
      cashKopecks: l.cashKopecks.toString(),
      debtKopecks: l.debtKopecks.toString(),
      cardTransferKopecks: l.cardTransferKopecks.toString(),
    })),
    wholesaleByClient: aggregate.wholesaleByClient.map((l) => ({
      clientLabel: l.clientLabel,
      grams: l.grams.toString(),
      packageCount: l.packageCount.toString(),
      revenueKopecks: l.revenueKopecks.toString(),
      cashKopecks: l.cashKopecks.toString(),
      debtKopecks: l.debtKopecks.toString(),
      cardTransferKopecks: l.cardTransferKopecks.toString(),
    })),
  };
}

/** Выручка и себестоимость (копейки строками). */
export type TripFinancialsJson = {
  revenueKopecks: string;
  costOfSoldKopecks: string;
  costOfShortageKopecks: string;
  grossProfitKopecks: string;
  debtPaidKopecks: string;
  debtOutstandingKopecks: string;
  expensesKopecks: string;
  netProfitKopecks: string;
  fieldExpensesKopecks: string;
  cashToHandOverKopecks: string;
};

export type SellerFieldExpenseJson = {
  id: string;
  tripId: string;
  expenseDate: string;
  category: string;
  amountKopecks: string;
  comment: string | null;
};

export function sellerFieldExpensesToJson(
  rows: Array<{
    id: string;
    tripId: string;
    expenseDate: Date;
    category: string;
    amountKopecks: bigint;
    comment: string | null;
  }>,
): SellerFieldExpenseJson[] {
  return rows.map((e) => ({
    id: e.id,
    tripId: e.tripId,
    expenseDate: calendarYmdFromDate(e.expenseDate),
    category: e.category,
    amountKopecks: e.amountKopecks.toString(),
    comment: e.comment,
  }));
}

export function tripFinancialsToJson(f: TripFinancials): TripFinancialsJson {
  return {
    revenueKopecks: f.revenueKopecks.toString(),
    costOfSoldKopecks: f.costOfSoldKopecks.toString(),
    costOfShortageKopecks: f.costOfShortageKopecks.toString(),
    grossProfitKopecks: f.grossProfitKopecks.toString(),
    debtPaidKopecks: f.debtPaidKopecks.toString(),
    debtOutstandingKopecks: f.debtOutstandingKopecks.toString(),
    expensesKopecks: f.expensesKopecks.toString(),
    netProfitKopecks: f.netProfitKopecks.toString(),
    fieldExpensesKopecks: f.fieldExpensesKopecks.toString(),
    cashToHandOverKopecks: f.cashToHandOverKopecks.toString(),
  };
}

export type TripDebtReceivableJson = {
  saleId: string;
  clientLabel: string | null;
  debtKopecks: string;
  paidKopecks: string;
  remainingKopecks: string;
  status: "open" | "closed";
  soldAt: string;
};

export function tripDebtReceivablesToJson(
  rows: Array<{
    saleId: string;
    clientLabel: string | null;
    debtKopecks: bigint;
    paidKopecks: bigint;
    remainingKopecks: bigint;
    status: "open" | "closed";
    soldAt: Date;
  }>,
): TripDebtReceivableJson[] {
  return rows.map((r) => ({
    saleId: r.saleId,
    clientLabel: r.clientLabel,
    debtKopecks: r.debtKopecks.toString(),
    paidKopecks: r.paidKopecks.toString(),
    remainingKopecks: r.remainingKopecks.toString(),
    status: r.status,
    soldAt: r.soldAt.toISOString(),
  }));
}
