export type TripShortageAppend = {
  id: string;
  tripId: string;
  batchId: string;
  grams: bigint;
  reason: string;
};

export type TripShortageBatchLine = {
  batchId: string;
  grams: bigint;
};

export type TripShortageAggregate = {
  totalGrams: bigint;
  byBatch: TripShortageBatchLine[];
};

export interface TripShortageRepository {
  append(row: TripShortageAppend): Promise<void>;
  aggregateByTripId(tripId: string): Promise<TripShortageAggregate>;
  totalGramsForTripAndBatch(tripId: string, batchId: string): Promise<bigint>;
}
