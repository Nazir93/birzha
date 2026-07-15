import { grossKgFromNetKg, netKgFromGrossKg, TARE_GRAMS_PER_PACKAGE } from "@birzha/contracts";

/** Нетто кг для API продажи: при ящиках поле ввода — брутто. */
export function sellerNetKgFromGrossInput(grossKgRaw: string, packageCount: number): number {
  const gross = Number(String(grossKgRaw).trim().replace(",", "."));
  if (!Number.isFinite(gross) || gross <= 0) {
    throw new Error("Укажите брутто, кг (положительное число)");
  }
  try {
    return netKgFromGrossKg(gross, packageCount);
  } catch {
    throw new Error("Нетто ≤ 0 (брутто минус 0,5 кг × ящики). Уменьшите ящики или увеличьте брутто.");
  }
}

/** Подпись поля нетто в форме продавца. */
export function sellerNetKgDisplayFromGross(grossKgRaw: string, packageCountRaw: string): string {
  const pkgs = Number.parseInt(String(packageCountRaw).trim().replace(",", "."), 10);
  if (!Number.isFinite(pkgs) || pkgs < 0) {
    return "";
  }
  try {
    const net = sellerNetKgFromGrossInput(grossKgRaw, pkgs);
    return String(net).replace(".", ",");
  } catch {
    return "";
  }
}

/** Брутто граммы из нетто продажи и ящиков (отчёт). */
export function saleGrossGramsFromNet(netGrams: bigint, packageCount: bigint): bigint {
  const pkgs = packageCount > 0n ? packageCount : 0n;
  return netGrams + pkgs * BigInt(TARE_GRAMS_PER_PACKAGE);
}

export function saleGrossKgLabelFromNetKg(netKg: number, packageCount: number): number {
  return grossKgFromNetKg(netKg, packageCount);
}
