/** Кг (ввод) ↔ граммы (канон домена и БД). */
export function kgToGrams(kg: number): bigint {
  return BigInt(Math.round(kg * 1000));
}

export function gramsToKg(grams: bigint): number {
  return Number(grams) / 1000;
}
