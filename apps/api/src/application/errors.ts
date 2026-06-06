export class BatchNotFoundError extends Error {
  readonly batchId: string;

  constructor(batchId: string) {
    super(`Партия не найдена: ${batchId}`);
    this.name = "BatchNotFoundError";
    this.batchId = batchId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TripNotFoundError extends Error {
  readonly tripId: string;

  constructor(tripId: string) {
    super(`Рейс не найден: ${tripId}`);
    this.name = "TripNotFoundError";
    this.tripId = tripId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TripClosedError extends Error {
  readonly tripId: string;

  constructor(tripId: string) {
    super(`Рейс закрыт для отгрузок: ${tripId}`);
    this.name = "TripClosedError";
    this.tripId = tripId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Погрузка с другого склада после закрепления продавца за рейсом. */
export class TripSellerCrossWarehouseLoadingError extends Error {
  readonly tripId: string;
  readonly warehouseId: string;

  constructor(tripId: string, warehouseId: string) {
    super(
      "Рейс закреплён за продавцом — догрузка с другого склада недоступна. Завершите погрузку со всех складов, затем закрепите продавца.",
    );
    this.name = "TripSellerCrossWarehouseLoadingError";
    this.tripId = tripId;
    this.warehouseId = warehouseId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Удаление запрещено: по рейсу уже есть отгрузки, продажи или недостачи. */
export class TripNotEmptyError extends Error {
  readonly tripId: string;

  constructor(tripId: string) {
    super(
      `Рейс ${tripId} нельзя удалить: есть движения по отгрузкам, продажам или недостачам. Сначала отмените операции (в MVP — только пустой рейс).`,
    );
    this.name = "TripNotEmptyError";
    this.tripId = tripId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Масса в рейсе по партии (отгружено − уже продано) меньше запрошенной продажи. */
/** Запрошена недостача больше, чем остаток по «бюджету» рейса (отгружено − продано − уже списано). */
export class TripShortageExceedsNetError extends Error {
  readonly tripId: string;
  readonly batchId: string;
  readonly availableGrams: bigint;
  readonly requestedGrams: bigint;

  constructor(tripId: string, batchId: string, availableGrams: bigint, requestedGrams: bigint) {
    super(
      `Недостача в рейсе ${tripId} по партии ${batchId} превышает остаток: доступно ${availableGrams} г, запрошено ${requestedGrams} г`,
    );
    this.name = "TripShortageExceedsNetError";
    this.tripId = tripId;
    this.batchId = batchId;
    this.availableGrams = availableGrams;
    this.requestedGrams = requestedGrams;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Некорректное разбиение выручки на нал / долг (mixed). */
export class SalePaymentSplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalePaymentSplitError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CounterpartyNotFoundError extends Error {
  readonly counterpartyId: string;

  constructor(counterpartyId: string) {
    super(`Контрагент не найден или отключён: ${counterpartyId}`);
    this.name = "CounterpartyNotFoundError";
    this.counterpartyId = counterpartyId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WholesalerNotFoundError extends Error {
  readonly wholesalerId: string;

  constructor(wholesalerId: string) {
    super(`Оптовик не найден или отключён: ${wholesalerId}`);
    this.name = "WholesalerNotFoundError";
    this.wholesalerId = wholesalerId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WarehouseNotFoundError extends Error {
  readonly warehouseId: string;

  constructor(warehouseId: string) {
    super(`Склад не найден: ${warehouseId}`);
    this.name = "WarehouseNotFoundError";
    this.warehouseId = warehouseId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Системные записи (сид) из демо-репозитория без БД. */
export class SeededResourceDeleteForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeededResourceDeleteForbiddenError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Код склада уже занят (уникальный `warehouses.code`). */
export class WarehouseCodeConflictError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`Код склада уже занят: ${code}`);
    this.name = "WarehouseCodeConflictError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Код калибра уже занят (уникальный `product_grades.code`). */
export class ProductGradeCodeConflictError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`Код калибра уже занят: ${code}`);
    this.name = "ProductGradeCodeConflictError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ProductGradeNotFoundError extends Error {
  readonly productGradeId: string;

  constructor(productGradeId: string) {
    super(`Калибр / код строки не найден: ${productGradeId}`);
    this.name = "ProductGradeNotFoundError";
    this.productGradeId = productGradeId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PurchaseDocumentNotFoundError extends Error {
  readonly documentId: string;

  constructor(documentId: string) {
    super(`Накладная не найдена: ${documentId}`);
    this.name = "PurchaseDocumentNotFoundError";
    this.documentId = documentId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class LoadingManifestNotFoundError extends Error {
  readonly manifestId: string;

  constructor(manifestId: string) {
    super(`Погрузочная накладная не найдена: ${manifestId}`);
    this.name = "LoadingManifestNotFoundError";
    this.manifestId = manifestId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Удаление запрещено: по накладной уже есть отгрузка в рейс. */
export class LoadingManifestNotEmptyError extends Error {
  readonly manifestId: string;
  readonly reason: string;

  constructor(manifestId: string, reason: string) {
    super(
      `Погрузочную накладную ${manifestId} нельзя удалить: ${reason}`,
    );
    this.name = "LoadingManifestNotEmptyError";
    this.manifestId = manifestId;
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Уникальный номер погрузочной накладной уже занят. */
export class LoadingManifestNumberConflictError extends Error {
  readonly manifestNumber: string;

  constructor(manifestNumber: string) {
    super(`Номер погрузочной накладной уже занят: ${manifestNumber}`);
    this.name = "LoadingManifestNumberConflictError";
    this.manifestNumber = manifestNumber;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Сущность нельзя удалить: на неё ссылаются накладные, партии, рейс и т.п.
 * Текст для пользователя/логов.
 */
export class ResourceInUseError extends Error {
  constructor(
    public readonly code: "warehouse" | "product_grade" | "counterparty",
    message: string,
  ) {
    super(message);
    this.name = "ResourceInUseError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Сумма строки накладной не сходится с кг × цена (допуск ±1 коп). */
export class PurchaseLineTotalMismatchError extends Error {
  readonly lineIndex: number;
  readonly expectedKopecks: number;
  readonly actualKopecks: number;

  constructor(lineIndex: number, expectedKopecks: number, actualKopecks: number) {
    super(
      `Строка ${lineIndex + 1}: ожидаемая сумма ${expectedKopecks} коп., в теле ${actualKopecks} коп.`,
    );
    this.name = "PurchaseLineTotalMismatchError";
    this.lineIndex = lineIndex;
    this.expectedKopecks = expectedKopecks;
    this.actualKopecks = actualKopecks;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TripSaleLineNotFoundError extends Error {
  readonly lineId: string;

  constructor(lineId: string) {
    super(`Строка продажи не найдена: ${lineId}`);
    this.name = "TripSaleLineNotFoundError";
    this.lineId = lineId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Продавец не может править чужую продажу или рейс закрыт. */
export class TripSaleEditForbiddenError extends Error {
  constructor(message = "Нельзя изменить эту продажу") {
    super(message);
    this.name = "TripSaleEditForbiddenError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InsufficientStockForTripError extends Error {
  readonly tripId: string;
  readonly batchId: string;
  readonly availableGrams: bigint;
  readonly requestedGrams: bigint;

  constructor(tripId: string, batchId: string, availableGrams: bigint, requestedGrams: bigint) {
    super(
      `Недостаточно массы в рейсе ${tripId} по партии ${batchId}: доступно ${availableGrams} г, запрошено ${requestedGrams} г`,
    );
    this.name = "InsufficientStockForTripError";
    this.tripId = tripId;
    this.batchId = batchId;
    this.availableGrams = availableGrams;
    this.requestedGrams = requestedGrams;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
