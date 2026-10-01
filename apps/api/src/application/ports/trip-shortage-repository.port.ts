export type TripShortageAppend = {
  id: string;
  tripId: string;
  batchId: string;
  grams: bigint;
  reason: string;
  packageCount: bigint | null;
};

export type TripShortageBatchLine = {
  batchId: string;
  grams: bigint;
  packageCount: bigint;
};

export type TripShortageAggregate = {
  totalGrams: bigint;
  totalPackageCount: bigint;
  byBatch: TripShortageBatchLine[];
};

export interface TripShortageRepository {
  append(row: TripShortageAppend): Promise<void>;
  aggregateByTripId(tripId: string): Promise<TripShortageAggregate>;
  totalGramsForTripAndBatch(tripId: string, batchId: string): Promise<bigint>;
  deleteByBatchIds(batchIds: string[]): Promise<void>;
  /** Удаление всех строк журнала по рейсу (очистка архива). */
  deleteAllForTripId(tripId: string): Promise<void>;
}
