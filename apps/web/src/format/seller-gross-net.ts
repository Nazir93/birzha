import {
  netKgFromGrossKg,
  TARE_GRAMS_PER_PACKAGE,
  tareGramsPerPackageForProductGroup,
} from "@birzha/contracts";

function tareLabelKg(tareGrams: number): string {
  const kg = tareGrams / 1000;
  return Number.isInteger(kg) ? String(kg) : String(kg).replace(".", ",");
}

/** Нетто кг для API продажи: при ящиках поле ввода — брутто. */
export function sellerNetKgFromGrossInput(
  grossKgRaw: string,
  packageCount: number,
  productGroup?: string | null,
): number {
  const gross = Number(String(grossKgRaw).trim().replace(",", "."));
  if (!Number.isFinite(gross) || gross <= 0) {
    throw new Error("Укажите брутто, кг (положительное число)");
  }
  const tare = tareGramsPerPackageForProductGroup(productGroup);
  try {
    return netKgFromGrossKg(gross, packageCount, tare);
  } catch {
    throw new Error(
      `Нетто ≤ 0 (брутто минус ${tareLabelKg(tare)} кг × ящики). Уменьшите ящики или увеличьте брутто.`,
    );
  }
}

/** Подпись поля нетто в форме продавца. */
export function sellerNetKgDisplayFromGross(
  grossKgRaw: string,
  packageCountRaw: string,
  productGroup?: string | null,
): string {
  const pkgs = Number.parseInt(String(packageCountRaw).trim().replace(",", "."), 10);
  if (!Number.isFinite(pkgs) || pkgs < 0) {
    return "";
  }
  try {
    const net = sellerNetKgFromGrossInput(grossKgRaw, pkgs, productGroup);
    return String(net).replace(".", ",");
  } catch {
    return "";
  }
}

/** Подсказка формулы нетто в UI продавца. */
export function sellerNetFromGrossHint(productGroup?: string | null): string {
  const tare = tareGramsPerPackageForProductGroup(productGroup);
  return `брутто − ${tareLabelKg(tare)}×ящ.`;
}

/** Брутто граммы из нетто продажи и ящиков (отчёт). */
export function saleGrossGramsFromNet(
  netGrams: bigint,
  packageCount: bigint,
  productGroup?: string | null,
): bigint {
  const pkgs = packageCount > 0n ? packageCount : 0n;
  const tare = tareGramsPerPackageForProductGroup(productGroup);
  return netGrams + pkgs * BigInt(tare);
}

/** @deprecated константа помидоров; для подсказок без товара. */
export { TARE_GRAMS_PER_PACKAGE };
