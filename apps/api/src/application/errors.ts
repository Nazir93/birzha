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
