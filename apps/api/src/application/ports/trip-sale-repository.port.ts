export type TripSaleAppend = {
  id: string;
  tripId: string;
  batchId: string;
  saleId: string;
  grams: bigint;
  pricePerKgKopecks: bigint;
  revenueKopecks: bigint;
  cashKopecks: bigint;
  debtKopecks: bigint;
};

export type TripSaleBatchLine = {
  batchId: string;
  grams: bigint;
  revenueKopecks: bigint;
  cashKopecks: bigint;
  debtKopecks: bigint;
};

export type TripSaleAggregate = {
  totalGrams: bigint;
  totalRevenueKopecks: bigint;
  totalCashKopecks: bigint;
  totalDebtKopecks: bigint;
  byBatch: TripSaleBatchLine[];
};

export interface TripSaleRepository {
  append(row: TripSaleAppend): Promise<void>;
  aggregateByTripId(tripId: string): Promise<TripSaleAggregate>;
  totalGramsForTripAndBatch(tripId: string, batchId: string): Promise<bigint>;
}
