/** Рубли → копейки для POST оплаты дебиторки (как в UI дебиторки). */
export function rubStringToPaymentKopecks(amountRub: string): number {
  const rub = Number(amountRub.replace(",", ".").trim());
  if (!Number.isFinite(rub) || rub <= 0) {
    throw new Error("Введите сумму оплаты в рублях");
  }
  return Math.round(rub * 100);
}
