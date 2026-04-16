import type { TripFinancials } from "../application/trip/trip-financials.js";
import type { TripSaleAggregate } from "../application/ports/trip-sale-repository.port.js";

/** Общая форма агрегатов отгрузок по рейсу. */
export type LedgerAggregateJson = {
  totalGrams: string;
  byBatch: { batchId: string; grams: string }[];
};

export function ledgerAggregateToJson(aggregate: {
  totalGrams: bigint;
  byBatch: { batchId: string; grams: bigint }[];
}): LedgerAggregateJson {
  return {
    totalGrams: aggregate.totalGrams.toString(),
    byBatch: aggregate.byBatch.map((l) => ({
      batchId: l.batchId,
      grams: l.grams.toString(),
    })),
  };
}

/** Продажи: масса + выручка в копейках (строки). */
export type SaleLedgerAggregateJson = {
  totalGrams: string;
  totalRevenueKopecks: string;
  totalCashKopecks: string;
  totalDebtKopecks: string;
  byBatch: {
    batchId: string;
    grams: string;
    revenueKopecks: string;
    cashKopecks: string;
    debtKopecks: string;
  }[];
};

export function saleLedgerAggregateToJson(aggregate: TripSaleAggregate): SaleLedgerAggregateJson {
  return {
    totalGrams: aggregate.totalGrams.toString(),
    totalRevenueKopecks: aggregate.totalRevenueKopecks.toString(),
    totalCashKopecks: aggregate.totalCashKopecks.toString(),
    totalDebtKopecks: aggregate.totalDebtKopecks.toString(),
    byBatch: aggregate.byBatch.map((l) => ({
      batchId: l.batchId,
      grams: l.grams.toString(),
      revenueKopecks: l.revenueKopecks.toString(),
      cashKopecks: l.cashKopecks.toString(),
      debtKopecks: l.debtKopecks.toString(),
    })),
  };
}

/** Выручка и себестоимость (копейки строками). */
export type TripFinancialsJson = {
  revenueKopecks: string;
  costOfSoldKopecks: string;
  costOfShortageKopecks: string;
  grossProfitKopecks: string;
};

export function tripFinancialsToJson(f: TripFinancials): TripFinancialsJson {
  return {
    revenueKopecks: f.revenueKopecks.toString(),
    costOfSoldKopecks: f.costOfSoldKopecks.toString(),
    costOfShortageKopecks: f.costOfShortageKopecks.toString(),
    grossProfitKopecks: f.grossProfitKopecks.toString(),
  };
}
