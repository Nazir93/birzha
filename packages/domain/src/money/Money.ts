import { DomainError } from "../errors.js";
import { CurrencyMismatchError } from "./money.errors.js";

export class Money {
  readonly amount: number;
  readonly currency: string;

  constructor(amount: number, currency: string) {
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      throw new DomainError(`Сумма должна быть конечным числом: ${String(amount)}`);
    }
    const trimmed = currency.trim();
    if (!trimmed) {
      throw new DomainError("Валюта не может быть пустой");
    }
    this.amount = amount;
    this.currency = trimmed;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}
