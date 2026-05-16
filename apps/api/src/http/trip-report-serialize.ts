import type { TripFinancials } from "../application/trip/trip-financials.js";
import type { TripSaleAggregate } from "../application/ports/trip-sale-repository.port.js";
import type { TripShipmentAggregate } from "../application/ports/trip-shipment-repository.port.js";

/** Агрегат недостачи (только масса по партиям). */
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
};

export function saleLedgerAggregateToJson(aggregate: TripSaleAggregate): SaleLedgerAggregateJson {
  return {
    totalGrams: aggregate.totalGrams.toString(),
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
      revenueKopecks: l.revenueKopecks.toString(),
      cashKopecks: l.cashKopecks.toString(),
      debtKopecks: l.debtKopecks.toString(),
      cardTransferKopecks: l.cardTransferKopecks.toString(),
    })),
    byClient: aggregate.byClient.map((l) => ({
      clientLabel: l.clientLabel,
      grams: l.grams.toString(),
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
};

export function tripFinancialsToJson(f: TripFinancials): TripFinancialsJson {
  return {
    revenueKopecks: f.revenueKopecks.toString(),
    costOfSoldKopecks: f.costOfSoldKopecks.toString(),
    costOfShortageKopecks: f.costOfShortageKopecks.toString(),
    grossProfitKopecks: f.grossProfitKopecks.toString(),
  };
}
