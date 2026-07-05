export type TripShipmentAppend = {
  id: string;
  tripId: string;
  batchId: string;
  grams: bigint;
  /** Количество ящиков в этой строке отгрузки; `null` — не указано. */
  packageCount: bigint | null;
};

export type TripShipmentBatchLine = {
  batchId: string;
  grams: bigint;
  /** Сумма ящиков по всем строкам отгрузки этой партии в рейсе. */
  packageCount: bigint;
};

export type TripShipmentAggregate = {
  totalGrams: bigint;
  totalPackageCount: bigint;
  byBatch: TripShipmentBatchLine[];
};

export interface TripShipmentRepository {
  append(row: TripShipmentAppend): Promise<void>;
  aggregateByTripId(tripId: string): Promise<TripShipmentAggregate>;
  /** Сумма отгрузок в рейс по одной партии. */
  totalGramsForTripAndBatch(tripId: string, batchId: string): Promise<bigint>;
  /** Сумма отгрузок по партии во всех рейсах. */
  totalGramsForBatch(batchId: string): Promise<bigint>;
  /** Удалить строки журнала, относящиеся к перечисленным партиям (удаление накладной). */
  deleteByBatchIds(batchIds: string[]): Promise<void>;
  /** Уменьшить сумму отгрузок по рейсу и партии (отвязка ПН). */
  reduceForTripAndBatch(
    tripId: string,
    batchId: string,
    gramsToRemove: bigint,
    packageCountToRemove: bigint | null,
  ): Promise<void>;
}
