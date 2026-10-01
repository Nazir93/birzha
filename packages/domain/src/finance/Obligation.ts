import { InvalidPaymentAmountError, PaymentExceedsDebtError } from "./obligation.errors.js";

export type ObligationState = {
  /** Полная сумма обязательства, копейки. */
  debtKopecks: bigint;
  /** Уже оплачено, копейки. */
  paidKopecks: bigint;
};

/**
 * Денежное обязательство: долг клиента по продаже (дебиторка) или долг
 * тепличнику по накладной (кредиторка). Одна логика частичных оплат для обоих.
 */
export class Obligation {
  private constructor(
    private readonly debtKopecks: bigint,
    private paidKopecks: bigint,
  ) {}

  static restore(state: ObligationState): Obligation {
    if (state.debtKopecks < 0n) {
      throw new InvalidPaymentAmountError(state.debtKopecks);
    }
    if (state.paidKopecks < 0n) {
      throw new InvalidPaymentAmountError(state.paidKopecks);
    }
    return new Obligation(state.debtKopecks, state.paidKopecks);
  }

  /** Проверяет и применяет оплату; при превышении остатка — `PaymentExceedsDebtError`. */
  applyPayment(amountKopecks: bigint): void {
    if (amountKopecks <= 0n) {
      throw new InvalidPaymentAmountError(amountKopecks);
    }
    const remaining = this.remainingKopecks();
    if (amountKopecks > remaining) {
      throw new PaymentExceedsDebtError(remaining, amountKopecks);
    }
    this.paidKopecks += amountKopecks;
  }

  getDebtKopecks(): bigint {
    return this.debtKopecks;
  }

  getPaidKopecks(): bigint {
    return this.paidKopecks;
  }

  /** Остаток к оплате; при переплате (долг уменьшили задним числом) — 0. */
  remainingKopecks(): bigint {
    const r = this.debtKopecks - this.paidKopecks;
    return r > 0n ? r : 0n;
  }

  /** Оплачено больше, чем долг (например, долг уменьшили правкой продажи). */
  isOverpaid(): boolean {
    return this.paidKopecks > this.debtKopecks;
  }

  isClosed(): boolean {
    return this.debtKopecks > 0n && this.paidKopecks >= this.debtKopecks;
  }
}
