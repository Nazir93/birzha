import {
  grossKgFromNetKg,
  kopecksToNakladnayaRubleFieldString,
  netKgFromGrossKg,
  nonnegativeDecimalStringToNumber,
  purchaseLineAmountKopecksFromDecimalStrings,
  TARE_GRAMS_PER_PACKAGE,
  tareGramsPerPackageForProductGroup,
} from "@birzha/contracts";

import { linePackageCountForNakladnayaSum } from "../validation/api-schemas.js";

/** Подпись расчёта нетто в формах/просмотре ЗН (по таре товара). */
export function nakladnayaNetFromGrossHint(
  tareGramsPerPackage: number = TARE_GRAMS_PER_PACKAGE,
): string {
  const kg = tareGramsPerPackage / 1000;
  const label = Number.isInteger(kg) ? String(kg) : String(kg).replace(".", ",");
  return `расчёт: брутто − ${label}×ящ.`;
}

/** @deprecated используйте nakladnayaNetFromGrossHint — оставлено для мест без товара. */
export const NAKLADNAYA_NET_FROM_GROSS_HINT = nakladnayaNetFromGrossHint(TARE_GRAMS_PER_PACKAGE);

export function tareGramsForNakladnayaProductGroup(
  productGroup: string | null | undefined,
): number {
  return tareGramsPerPackageForProductGroup(productGroup);
}

/** Поле «Сумма» по нетто-кг и ₽/кг; пустая строка, если расчёт невозможен. */
export function nakladnayaLineSumFieldFromKgPrice(netKg: string, pricePerKg: string): string {
  const kopecks = purchaseLineAmountKopecksFromDecimalStrings(netKg, pricePerKg);
  if (!Number.isFinite(kopecks) || kopecks < 0) {
    return "";
  }
  return kopecksToNakladnayaRubleFieldString(kopecks);
}

/** Нетто (кг) из брутто и ящиков; пусто, если нельзя посчитать. */
export function nakladnayaNetKgFieldFromGross(
  grossKg: string,
  packageCount: string,
  tareGramsPerPackage: number = TARE_GRAMS_PER_PACKAGE,
): string {
  const gross = nonnegativeDecimalStringToNumber(grossKg, 6);
  if (!Number.isFinite(gross) || gross <= 0) {
    return "";
  }
  const pkgs = linePackageCountForNakladnayaSum(packageCount);
  try {
    const net = netKgFromGrossKg(gross, pkgs, tareGramsPerPackage);
    return String(net).replace(".", ",");
  } catch {
    return "";
  }
}

/**
 * Брутто для просмотра/правки: сохранённое значение с API, иначе нетто + тара×ящ.
 * (старые строки без `grossQuantityGrams`).
 */
export function purchaseLineDisplayGrossKg(
  storedGrossKg: number | null | undefined,
  netKg: number,
  packageCount: string | null | undefined,
  tareGramsPerPackage: number = TARE_GRAMS_PER_PACKAGE,
): number {
  if (storedGrossKg != null && Number.isFinite(storedGrossKg) && storedGrossKg > 0) {
    return storedGrossKg;
  }
  if (!Number.isFinite(netKg) || netKg < 0) {
    return 0;
  }
  const pkgs = linePackageCountForNakladnayaSum(packageCount ?? "");
  try {
    return grossKgFromNetKg(netKg, pkgs, tareGramsPerPackage);
  } catch {
    return netKg;
  }
}

/** Сумма строки: нетто (брутто − тара×ящ.) × ₽/кг. */
export function nakladnayaLineSumFieldFromGrossKgPrice(
  grossKg: string,
  packageCount: string,
  pricePerKg: string,
  tareGramsPerPackage: number = TARE_GRAMS_PER_PACKAGE,
): string {
  const netField = nakladnayaNetKgFieldFromGross(grossKg, packageCount, tareGramsPerPackage);
  if (netField === "") {
    return "";
  }
  return nakladnayaLineSumFieldFromKgPrice(netField, pricePerKg);
}
