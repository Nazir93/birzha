/** Строка журнала продаж (чтение / правка). */
export type TripSaleLineRecord = {
  id: string;
  tripId: string;
  batchId: string;
  saleId: string;
  grams: bigint;
  pricePerKgKopecks: bigint;
  revenueKopecks: bigint;
  cashKopecks: bigint;
  debtKopecks: bigint;
  cardTransferKopecks: bigint;
  saleChannel: "retail" | "wholesale";
  clientLabel: string | null;
  counterpartyId: string | null;
  wholesaleBuyerId: string | null;
  recordedByUserId: string | null;
  packageCount: bigint | null;
  recordedAt: Date;
};

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
  /** Ящики по строке продажи (если указаны при фиксации). */
  packageCount?: bigint | null;
  /** По умолчанию — момент вставки в БД. */
  recordedAt?: Date;
};

export type TripSaleBatchLine = {
  batchId: string;
  grams: bigint;
  packageCount: bigint;
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
  totalPackageCount: bigint;
  totalRevenueKopecks: bigint;
  totalCashKopecks: bigint;
  totalDebtKopecks: bigint;
  totalCardTransferKopecks: bigint;
  retailGrams: bigint;
  wholesaleGrams: bigint;
  retailRevenueKopecks: bigint;
  wholesaleRevenueKopecks: bigint;
  retailCashKopecks: bigint;
  retailDebtKopecks: bigint;
  retailCardTransferKopecks: bigint;
  wholesaleCashKopecks: bigint;
  wholesaleDebtKopecks: bigint;
  wholesaleCardTransferKopecks: bigint;
  byBatch: TripSaleBatchLine[];
  byClient: TripSaleClientLine[];
  /** Продажи по партиям только розница / только опт (для отчёта с переключением канала). */
  retailByBatch: TripSaleBatchLine[];
  wholesaleByBatch: TripSaleBatchLine[];
  retailByClient: TripSaleClientLine[];
  wholesaleByClient: TripSaleClientLine[];
};

export interface TripSaleRepository {
  append(row: TripSaleAppend): Promise<void>;
  aggregateByTripId(tripId: string, filter?: { onlyRecordedByUserId: string }): Promise<TripSaleAggregate>;
  totalGramsForTripAndBatch(tripId: string, batchId: string): Promise<bigint>;
  listLinesByTripId(tripId: string, filter?: { onlyRecordedByUserId: string }): Promise<TripSaleLineRecord[]>;
  findLineById(lineId: string): Promise<TripSaleLineRecord | null>;
  updateLine(row: TripSaleLineRecord): Promise<void>;
  deleteLineById(lineId: string): Promise<void>;
  /** Число строк с этим `counterpartyId` (блокировка удаления справочника). */
  countByCounterpartyId(counterpartyId: string): Promise<number>;
  deleteByBatchIds(batchIds: string[]): Promise<void>;
  /** Удаление всех строк журнала по рейсу (очистка архива). */
  deleteAllForTripId(tripId: string): Promise<void>;
}
