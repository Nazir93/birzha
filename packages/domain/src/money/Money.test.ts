import { describe, expect, it } from "vitest";
import { Money } from "./Money.js";
import { CurrencyMismatchError } from "./money.errors.js";
import { DomainError } from "../errors.js";

describe("Money", () => {
  it("складывает суммы в одной валюте", () => {
    const a = new Money(100, "RUB");
    const b = new Money(25.5, "RUB");
    expect(a.add(b).amount).toBe(125.5);
  });

  it("вычитает суммы", () => {
    const a = new Money(50, "USD");
    const b = new Money(80, "USD");
    expect(a.subtract(b).amount).toBe(-30);
  });

  it("isZero для нуля", () => {
    expect(new Money(0, "RUB").isZero()).toBe(true);
  });

  it("не смешивает валюты", () => {
    const a = new Money(1, "RUB");
    const b = new Money(1, "USD");
    expect(() => a.add(b)).toThrow(CurrencyMismatchError);
  });

  it("отклоняет некорректную сумму", () => {
    expect(() => new Money(Number.NaN, "RUB")).toThrow(DomainError);
  });
});
