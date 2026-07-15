/** Тара одного ящика, кг (фикс на весь проект; в граммах — 500). */
export const TARE_KG_PER_PACKAGE = 0.5;

/** Тара одного ящика, граммы (совпадает с `TARE_GRAMS_PER_PACKAGE` в domain). */
export const TARE_GRAMS_PER_PACKAGE = 500;

const TARE_GRAMS = TARE_GRAMS_PER_PACKAGE;

function packagesFloor(packageCount: number | null | undefined): number {
  if (packageCount == null || !Number.isFinite(packageCount) || packageCount < 0) {
    return 0;
  }
  return Math.floor(packageCount);
}

/** Нетто, кг = брутто − 0,5 × ящики (через граммы, без float-дрейфа). */
export function netKgFromGrossKg(grossKg: number, packageCount?: number | null): number {
  if (!Number.isFinite(grossKg) || grossKg <= 0) {
    throw new Error("gross_kg_invalid");
  }
  const pkgs = packagesFloor(packageCount);
  const grossGrams = Math.round(grossKg * 1000);
  const tare = pkgs * TARE_GRAMS;
  if (tare >= grossGrams) {
    throw new Error("net_kg_non_positive");
  }
  return (grossGrams - tare) / 1000;
}

/** Брутто, кг = нетто + 0,5 × ящики (для отображения). */
export function grossKgFromNetKg(netKg: number, packageCount?: number | null): number {
  if (!Number.isFinite(netKg) || netKg < 0) {
    throw new Error("net_kg_invalid");
  }
  const pkgs = packagesFloor(packageCount);
  const netGrams = Math.round(netKg * 1000);
  return (netGrams + pkgs * TARE_GRAMS) / 1000;
}
