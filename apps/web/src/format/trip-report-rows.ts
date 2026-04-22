import type { ShipmentReportResponse } from "../api/types.js";

export type TripBatchTableRow = {
  batchId: string;
  shippedG: bigint;
  /** Ящики по отгрузке в рейс (сумма по строкам), если в отчёте есть поля. */
  shippedPackages: bigint;
  soldG: bigint;
  shortageG: bigint;
  /** Отгружено − продано − недостача (граммы). */
  netTransitG: bigint;
  revenueK: bigint;
  cashK: bigint;
  debtK: bigint;
};

function bi(x: string | undefined): bigint {
  if (x === undefined || x === "") {
    return 0n;
  }
  return BigInt(x);
}

/** Объединяет `byBatch` из отчёта рейса в строки для таблицы сверки. */
export function buildTripBatchRows(r: ShipmentReportResponse): TripBatchTableRow[] {
  const ids = new Set<string>();
  for (const b of r.shipment.byBatch) {
    ids.add(b.batchId);
  }
  for (const b of r.sales.byBatch) {
    ids.add(b.batchId);
  }
  for (const b of r.shortage.byBatch) {
    ids.add(b.batchId);
  }

  const ship = new Map<string, bigint>();
  const shipPkg = new Map<string, bigint>();
  for (const b of r.shipment.byBatch) {
    ship.set(b.batchId, bi(b.grams));
    shipPkg.set(b.batchId, bi(b.packageCount));
  }

  const soldG = new Map<string, bigint>();
  const revenue = new Map<string, bigint>();
  const cash = new Map<string, bigint>();
  const debt = new Map<string, bigint>();
  for (const b of r.sales.byBatch) {
    soldG.set(b.batchId, bi(b.grams));
    revenue.set(b.batchId, bi(b.revenueKopecks));
    cash.set(b.batchId, bi(b.cashKopecks));
    debt.set(b.batchId, bi(b.debtKopecks));
  }

  const short = new Map<string, bigint>();
  for (const b of r.shortage.byBatch) {
    short.set(b.batchId, bi(b.grams));
  }

  const sorted = [...ids].sort((a, b) => a.localeCompare(b, "ru"));

  return sorted.map((batchId) => {
    const sg = ship.get(batchId) ?? 0n;
    const sold = soldG.get(batchId) ?? 0n;
    const sh = short.get(batchId) ?? 0n;
    return {
      batchId,
      shippedG: sg,
      shippedPackages: shipPkg.get(batchId) ?? 0n,
      soldG: sold,
      shortageG: sh,
      netTransitG: sg - sold - sh,
      revenueK: revenue.get(batchId) ?? 0n,
      cashK: cash.get(batchId) ?? 0n,
      debtK: debt.get(batchId) ?? 0n,
    };
  });
}

/**
 * Оценка ящиков, оставшихся «в пути» по рейсу: ящики отгрузки × (остаток в пути / отгружено в г).
 * Продажи в учёте только в кг — ящиков в продаже нет; оценка совпадает с линейным списанием по массе.
 */
export function estimateNetTransitPackageCount(r: TripBatchTableRow): bigint {
  if (r.shippedG <= 0n || r.shippedPackages <= 0n || r.netTransitG <= 0n) {
    return 0n;
  }
  return (r.shippedPackages * r.netTransitG) / r.shippedG;
}

/** Суммы по колонкам таблицы партий (для подвала и сверки с API). */
export function aggregateTripBatchRows(rows: TripBatchTableRow[]): {
  shippedG: bigint;
  shippedPackages: bigint;
  soldG: bigint;
  shortageG: bigint;
  netTransitG: bigint;
  revenueK: bigint;
  cashK: bigint;
  debtK: bigint;
} {
  let shippedG = 0n;
  let shippedPackages = 0n;
  let soldG = 0n;
  let shortageG = 0n;
  let netTransitG = 0n;
  let revenueK = 0n;
  let cashK = 0n;
  let debtK = 0n;
  for (const row of rows) {
    shippedG += row.shippedG;
    shippedPackages += row.shippedPackages;
    soldG += row.soldG;
    shortageG += row.shortageG;
    netTransitG += row.netTransitG;
    revenueK += row.revenueK;
    cashK += row.cashK;
    debtK += row.debtK;
  }
  return { shippedG, shippedPackages, soldG, shortageG, netTransitG, revenueK, cashK, debtK };
}

export type BatchTotalsReconciliation = {
  shipmentGramsOk: boolean;
  salesGramsOk: boolean;
  shortageGramsOk: boolean;
  revenueKopecksOk: boolean;
  cashDebtOk: boolean;
  /** Суммы по `sales.byClient` совпадают с итогами рейса (если есть строки клиентов). */
  clientTotalsOk: boolean;
};

/** Сверка сумм по строкам партий с агрегатами в ответе API (должны совпадать при полной разбивке). */
export function reconcileBatchTotalsWithReport(
  r: ShipmentReportResponse,
  agg: ReturnType<typeof aggregateTripBatchRows>,
): BatchTotalsReconciliation {
  const shipTotal = bi(r.shipment.totalGrams);
  const salesTotal = bi(r.sales.totalGrams);
  const shortTotal = bi(r.shortage.totalGrams);
  const revTotal = bi(r.sales.totalRevenueKopecks);
  const cashTotal = bi(r.sales.totalCashKopecks);
  const debtTotal = bi(r.sales.totalDebtKopecks);

  let sumClientG = 0n;
  let sumClientRev = 0n;
  let sumClientCash = 0n;
  let sumClientDebt = 0n;
  for (const c of r.sales.byClient) {
    sumClientG += bi(c.grams);
    sumClientRev += bi(c.revenueKopecks);
    sumClientCash += bi(c.cashKopecks);
    sumClientDebt += bi(c.debtKopecks);
  }
  const clientTotalsOk =
    sumClientG === salesTotal &&
    sumClientRev === revTotal &&
    sumClientCash === cashTotal &&
    sumClientDebt === debtTotal;

  return {
    shipmentGramsOk: agg.shippedG === shipTotal,
    salesGramsOk: agg.soldG === salesTotal,
    shortageGramsOk: agg.shortageG === shortTotal,
    revenueKopecksOk: agg.revenueK === revTotal,
    cashDebtOk: agg.cashK === cashTotal && agg.debtK === debtTotal,
    clientTotalsOk,
  };
}
