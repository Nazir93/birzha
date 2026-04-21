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

export class WarehouseNotFoundError extends Error {
  readonly warehouseId: string;

  constructor(warehouseId: string) {
    super(`Склад не найден: ${warehouseId}`);
    this.name = "WarehouseNotFoundError";
    this.warehouseId = warehouseId;
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
