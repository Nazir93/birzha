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
  /** Перевод на карту (без эквайринга); вместе с cash и debt закрывает выручку. */
  cardTransferKopecks: bigint;
  /** Розница или опт. */
  saleChannel: "retail" | "wholesale";
  /** null / undefined — не указан (агрегируется в пустую метку в отчёте). */
  clientLabel?: string | null;
  /** Ссылка на справочник; снимок имени дублируется в `clientLabel`. */
  counterpartyId?: string | null;
  /** При канале «опт» — выбранный оптовик из справочника. */
  wholesaleBuyerId?: string | null;
  /** Учётная запись, внёсшая продажу; для sync и REST с JWT. */
  recordedByUserId?: string | null;
};

export type TripSaleBatchLine = {
  batchId: string;
  grams: bigint;
  revenueKopecks: bigint;
  cashKopecks: bigint;
  debtKopecks: bigint;
  cardTransferKopecks: bigint;
};

export type TripSaleClientLine = {
  /** Пустая строка — продажи без подписи клиента. */
  clientLabel: string;
  grams: bigint;
  revenueKopecks: bigint;
  cashKopecks: bigint;
  debtKopecks: bigint;
  cardTransferKopecks: bigint;
};

export type TripSaleAggregate = {
  totalGrams: bigint;
  totalRevenueKopecks: bigint;
  totalCashKopecks: bigint;
  totalDebtKopecks: bigint;
  totalCardTransferKopecks: bigint;
  retailGrams: bigint;
  wholesaleGrams: bigint;
  retailRevenueKopecks: bigint;
  wholesaleRevenueKopecks: bigint;
  byBatch: TripSaleBatchLine[];
  byClient: TripSaleClientLine[];
};

export interface TripSaleRepository {
  append(row: TripSaleAppend): Promise<void>;
  aggregateByTripId(tripId: string, filter?: { onlyRecordedByUserId: string }): Promise<TripSaleAggregate>;
  totalGramsForTripAndBatch(tripId: string, batchId: string): Promise<bigint>;
  /** Число строк с этим `counterpartyId` (блокировка удаления справочника). */
  countByCounterpartyId(counterpartyId: string): Promise<number>;
  deleteByBatchIds(batchIds: string[]): Promise<void>;
}
