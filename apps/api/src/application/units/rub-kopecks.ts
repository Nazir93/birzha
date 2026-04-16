/** Цена за кг в рублях (ввод API) → цена за кг в копейках (целое). */
export function rubPerKgToKopecksPerKg(rubPerKg: number): bigint {
  if (!Number.isFinite(rubPerKg) || rubPerKg < 0) {
    throw new Error("rubPerKg должно быть неотрицательным конечным числом");
  }
  return BigInt(Math.round(rubPerKg * 100));
}

/** Выручка по строке: граммы × цена за кг (коп/кг) / 1000, округление к ближайшей копейке. */
export function revenueKopecksFromGramsAndPricePerKg(grams: bigint, pricePerKgKopecks: bigint): bigint {
  return (grams * pricePerKgKopecks + 500n) / 1000n;
}
