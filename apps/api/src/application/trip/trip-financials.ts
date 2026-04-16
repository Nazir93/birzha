import type { TripSaleAggregate } from "../ports/trip-sale-repository.port.js";
import type { TripShortageAggregate } from "../ports/trip-shortage-repository.port.js";
import { revenueKopecksFromGramsAndPricePerKg, rubPerKgToKopecksPerKg } from "../units/rub-kopecks.js";

/** Деньги по рейсу в копейках: выручка из журнала продаж, себестоимость по закупочной цене партии. */
export type TripFinancials = {
  revenueKopecks: bigint;
  costOfSoldKopecks: bigint;
  costOfShortageKopecks: bigint;
  grossProfitKopecks: bigint;
};

/**
 * Себестоимость проданного и списанного по недостаче — по `Batch.getPricePerKg()` (руб/кг → коп/кг),
 * масса × цена с тем же округлением, что и выручка от продаж.
 */
export function computeTripFinancials(
  sales: TripSaleAggregate,
  shortage: TripShortageAggregate,
  purchaseRubPerKgByBatchId: Map<string, number>,
): TripFinancials {
  let costOfSold = 0n;
  for (const line of sales.byBatch) {
    const rub = purchaseRubPerKgByBatchId.get(line.batchId);
    if (rub === undefined) {
      throw new Error(`Нет закупочной цены для партии ${line.batchId}`);
    }
    costOfSold += revenueKopecksFromGramsAndPricePerKg(line.grams, rubPerKgToKopecksPerKg(rub));
  }
  let costOfShortage = 0n;
  for (const line of shortage.byBatch) {
    const rub = purchaseRubPerKgByBatchId.get(line.batchId);
    if (rub === undefined) {
      throw new Error(`Нет закупочной цены для партии ${line.batchId}`);
    }
    costOfShortage += revenueKopecksFromGramsAndPricePerKg(line.grams, rubPerKgToKopecksPerKg(rub));
  }
  const revenue = sales.totalRevenueKopecks;
  return {
    revenueKopecks: revenue,
    costOfSoldKopecks: costOfSold,
    costOfShortageKopecks: costOfShortage,
    grossProfitKopecks: revenue - costOfSold - costOfShortage,
  };
}
