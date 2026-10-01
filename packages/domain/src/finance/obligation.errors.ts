import { DomainError } from "../errors.js";

/** Оплата больше остатка обязательства (долг клиента или долг тепличнику). */
export class PaymentExceedsDebtError extends DomainError {
  constructor(
    public readonly remainingKopecks: bigint,
    public readonly requestedKopecks: bigint,
  ) {
    super(
      `Оплата превышает остаток долга: остаток ${remainingKopecks} коп., внесено ${requestedKopecks} коп.`,
    );
  }
}

/** Сумма оплаты должна быть положительной. */
export class InvalidPaymentAmountError extends DomainError {
  constructor(public readonly value: unknown) {
    super(`Некорректная сумма оплаты: ${String(value)}`);
  }
}
