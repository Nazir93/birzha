/** Строка целых копеек из API → отображение «руб, коп». */
export function kopecksToRubLabel(kopecks: string): string {
  const n = BigInt(kopecks);
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  const rub = abs / 100n;
  const kop = abs % 100n;
  const kopStr = kop < 10n ? `0${kop}` : `${kop}`;
  return `${sign}${rub.toString()},${kopStr}`;
}

/** Граммы (строка) → килограммы для подписи (в т.ч. отрицательные — остаток в пути). */
export function gramsToKgLabel(grams: string, fractionDigits = 3): string {
  const g = BigInt(grams);
  const sign = g < 0n ? "-" : "";
  const abs = g < 0n ? -g : g;
  const intPart = abs / 1000n;
  const frac = abs % 1000n;
  const fracStr = frac.toString().padStart(3, "0").slice(0, fractionDigits);
  return `${sign}${intPart.toString()},${fracStr}`;
}
