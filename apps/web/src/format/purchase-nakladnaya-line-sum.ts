import {
  grossKgFromNetKg,
  kopecksToNakladnayaRubleFieldString,
  netKgFromGrossKg,
  nonnegativeDecimalStringToNumber,
  purchaseLineAmountKopecksFromDecimalStrings,
} from "@birzha/contracts";

import { linePackageCountForNakladnayaSum } from "../validation/api-schemas.js";

/** Подпись расчёта нетто в формах/просмотре ЗН. */
export const NAKLADNAYA_NET_FROM_GROSS_HINT = "расчёт: брутто − 0,5×ящ.";

/** Поле «Сумма» по нетто-кг и ₽/кг; пустая строка, если расчёт невозможен. */
export function nakladnayaLineSumFieldFromKgPrice(netKg: string, pricePerKg: string): string {
  const kopecks = purchaseLineAmountKopecksFromDecimalStrings(netKg, pricePerKg);
  if (!Number.isFinite(kopecks) || kopecks < 0) {
    return "";
  }
  return kopecksToNakladnayaRubleFieldString(kopecks);
}

/** Нетто (кг) из брутто и ящиков; пусто, если нельзя посчитать. */
export function nakladnayaNetKgFieldFromGross(grossKg: string, packageCount: string): string {
  const gross = nonnegativeDecimalStringToNumber(grossKg, 6);
  if (!Number.isFinite(gross) || gross <= 0) {
    return "";
  }
  const pkgs = linePackageCountForNakladnayaSum(packageCount);
  try {
    const net = netKgFromGrossKg(gross, pkgs);
    return String(net).replace(".", ",");
  } catch {
    return "";
  }
}

/**
 * Брутто для просмотра/правки: сохранённое значение с API, иначе нетто + 0,5×ящ.
 * (старые строки без `grossQuantityGrams`).
 */
export function purchaseLineDisplayGrossKg(
  storedGrossKg: number | null | undefined,
  netKg: number,
  packageCount: string | null | undefined,
): number {
  if (storedGrossKg != null && Number.isFinite(storedGrossKg) && storedGrossKg > 0) {
    return storedGrossKg;
  }
  if (!Number.isFinite(netKg) || netKg < 0) {
    return 0;
  }
  const pkgs = linePackageCountForNakladnayaSum(packageCount ?? "");
  try {
    return grossKgFromNetKg(netKg, pkgs);
  } catch {
    return netKg;
  }
}

/** Сумма строки: нетто (брутто − 0,5×ящ.) × ₽/кг. */
export function nakladnayaLineSumFieldFromGrossKgPrice(
  grossKg: string,
  packageCount: string,
  pricePerKg: string,
): string {
  const netField = nakladnayaNetKgFieldFromGross(grossKg, packageCount);
  if (netField === "") {
    return "";
  }
  return nakladnayaLineSumFieldFromKgPrice(netField, pricePerKg);
}
