import { DomainError } from "../errors.js";

export class CurrencyMismatchError extends DomainError {
  constructor(
    public readonly left: string,
    public readonly right: string,
  ) {
    super(`Валюты не совпадают: ${left} и ${right}`);
  }
}
