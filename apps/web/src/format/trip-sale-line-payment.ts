/** Восстановить вид оплаты из сохранённой строки продажи (копейки). */
export function inferPaymentKindFromSaleLine(input: {
  revenueKopecks: string;
  cashKopecks: string;
  debtKopecks: string;
  cardTransferKopecks: string;
}): "cash" | "debt" | "mixed" | "card_transfer" {
  const rev = BigInt(input.revenueKopecks || "0");
  const cash = BigInt(input.cashKopecks || "0");
  const debt = BigInt(input.debtKopecks || "0");
  const card = BigInt(input.cardTransferKopecks || "0");
  if (rev <= 0n) {
    return "cash";
  }
  if (debt === rev) {
    return "debt";
  }
  if (card > 0n) {
    return "card_transfer";
  }
  if (cash > 0n && debt > 0n) {
    return "mixed";
  }
  return "cash";
}

export function kopecksPerKgToRubDecimalString(kopecksPerKg: string): string {
  const k = BigInt(kopecksPerKg || "0");
  const whole = k / 100n;
  const rem = k % 100n;
  if (rem === 0n) {
    return whole.toString();
  }
  return `${whole}.${rem.toString().padStart(2, "0").replace(/0+$/, "")}`;
}
