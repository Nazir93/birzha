import { describe, expect, it } from "vitest";

import { Obligation } from "./Obligation.js";
import { InvalidPaymentAmountError, PaymentExceedsDebtError } from "./obligation.errors.js";

describe("Obligation", () => {
  it("частичные оплаты уменьшают остаток, затем закрывают долг", () => {
    const o = Obligation.restore({ debtKopecks: 10_000n, paidKopecks: 0n });
    expect(o.remainingKopecks()).toBe(10_000n);
    expect(o.isClosed()).toBe(false);

    o.applyPayment(4_000n);
    expect(o.getPaidKopecks()).toBe(4_000n);
    expect(o.remainingKopecks()).toBe(6_000n);
    expect(o.isClosed()).toBe(false);

    o.applyPayment(6_000n);
    expect(o.remainingKopecks()).toBe(0n);
    expect(o.isClosed()).toBe(true);
    expect(o.isOverpaid()).toBe(false);
  });

  it("оплата больше остатка — PaymentExceedsDebtError с остатком", () => {
    const o = Obligation.restore({ debtKopecks: 5_000n, paidKopecks: 3_000n });
    try {
      o.applyPayment(2_001n);
      expect.fail("ожидалась ошибка");
    } catch (e) {
      expect(e).toBeInstanceOf(PaymentExceedsDebtError);
      const err = e as PaymentExceedsDebtError;
      expect(err.remainingKopecks).toBe(2_000n);
      expect(err.requestedKopecks).toBe(2_001n);
    }
    expect(o.getPaidKopecks()).toBe(3_000n);
  });

  it("нулевая и отрицательная оплата запрещены", () => {
    const o = Obligation.restore({ debtKopecks: 100n, paidKopecks: 0n });
    expect(() => o.applyPayment(0n)).toThrow(InvalidPaymentAmountError);
    expect(() => o.applyPayment(-5n)).toThrow(InvalidPaymentAmountError);
  });

  it("restore отвергает отрицательные суммы", () => {
    expect(() => Obligation.restore({ debtKopecks: -1n, paidKopecks: 0n })).toThrow(InvalidPaymentAmountError);
    expect(() => Obligation.restore({ debtKopecks: 1n, paidKopecks: -1n })).toThrow(InvalidPaymentAmountError);
  });

  it("переплата (долг уменьшили задним числом): остаток 0, isOverpaid", () => {
    const o = Obligation.restore({ debtKopecks: 1_000n, paidKopecks: 1_500n });
    expect(o.remainingKopecks()).toBe(0n);
    expect(o.isOverpaid()).toBe(true);
    expect(o.isClosed()).toBe(true);
    expect(() => o.applyPayment(1n)).toThrow(PaymentExceedsDebtError);
  });

  it("нулевой долг не считается закрытым обязательством", () => {
    const o = Obligation.restore({ debtKopecks: 0n, paidKopecks: 0n });
    expect(o.isClosed()).toBe(false);
    expect(o.remainingKopecks()).toBe(0n);
  });
});
