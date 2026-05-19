import { SalePaymentSplitError } from "../errors.js";

export function resolveSalePaymentSplit(
  revenueKopecks: bigint,
  paymentKind: "cash" | "debt" | "mixed" | "card_transfer" | undefined,
  cashKopecksMixed: bigint | undefined,
  cardTransferKopecksInput: bigint | undefined,
): { cashKopecks: bigint; debtKopecks: bigint; cardTransferKopecks: bigint } {
  const kind = paymentKind ?? "cash";
  if (kind === "cash") {
    return { cashKopecks: revenueKopecks, debtKopecks: 0n, cardTransferKopecks: 0n };
  }
  if (kind === "debt") {
    return { cashKopecks: 0n, debtKopecks: revenueKopecks, cardTransferKopecks: 0n };
  }
  if (kind === "mixed") {
    if (cashKopecksMixed === undefined) {
      throw new SalePaymentSplitError("При paymentKind=mixed укажите cashKopecksMixed");
    }
    if (cashKopecksMixed < 0n || cashKopecksMixed > revenueKopecks) {
      throw new SalePaymentSplitError("cashKopecksMixed должно быть от 0 до выручки по строке включительно");
    }
    return {
      cashKopecks: cashKopecksMixed,
      debtKopecks: revenueKopecks - cashKopecksMixed,
      cardTransferKopecks: 0n,
    };
  }
  if (kind === "card_transfer") {
    if (cardTransferKopecksInput === undefined) {
      throw new SalePaymentSplitError("При paymentKind=card_transfer укажите cardTransferKopecks");
    }
    if (cardTransferKopecksInput < 0n || cardTransferKopecksInput > revenueKopecks) {
      throw new SalePaymentSplitError("cardTransferKopecks должно быть от 0 до выручки по строке включительно");
    }
    return {
      cashKopecks: revenueKopecks - cardTransferKopecksInput,
      debtKopecks: 0n,
      cardTransferKopecks: cardTransferKopecksInput,
    };
  }
  return { cashKopecks: revenueKopecks, debtKopecks: 0n, cardTransferKopecks: 0n };
}
