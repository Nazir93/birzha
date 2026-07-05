import { kopecksToNakladnayaRubleFieldString, purchaseLineAmountKopecksFromDecimalStrings } from "@birzha/contracts";

/** Поле «Сумма, коп.» по кг и ₽/кг; пустая строка, если расчёт невозможен. */
export function nakladnayaLineSumFieldFromKgPrice(totalKg: string, pricePerKg: string): string {
  const kopecks = purchaseLineAmountKopecksFromDecimalStrings(totalKg, pricePerKg);
  if (!Number.isFinite(kopecks) || kopecks < 0) {
    return "";
  }
  return kopecksToNakladnayaRubleFieldString(kopecks);
}
