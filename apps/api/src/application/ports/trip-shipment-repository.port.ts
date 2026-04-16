export type TripShipmentAppend = {
  id: string;
  tripId: string;
  batchId: string;
  grams: bigint;
};

export type TripShipmentBatchLine = {
  batchId: string;
  grams: bigint;
};

export type TripShipmentAggregate = {
  totalGrams: bigint;
  byBatch: TripShipmentBatchLine[];
};

export interface TripShipmentRepository {
  append(row: TripShipmentAppend): Promise<void>;
  aggregateByTripId(tripId: string): Promise<TripShipmentAggregate>;
  /** Сумма отгрузок в рейс по одной партии. */
  totalGramsForTripAndBatch(tripId: string, batchId: string): Promise<bigint>;
}
