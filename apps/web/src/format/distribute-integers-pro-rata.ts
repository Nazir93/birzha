/**
 * Распределяет целое `total` пропорционально положительным весам `weights`.
 * Сумма результата всегда равна `total` (метод наибольших остатков).
 * Не-числа и неположительные веса считаются нулевыми.
 */
export function distributeIntegersProRata(weights: number[], total: number): number[] {
  const n = weights.length;
  if (n === 0) {
    return [];
  }
  if (total <= 0 || !Number.isFinite(total)) {
    return Array(n).fill(0);
  }
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sumW = w.reduce((a, b) => a + b, 0);
  if (sumW <= 0) {
    return Array(n).fill(0);
  }

  const exact = w.map((wi) => (total * wi) / sumW);
  const out = exact.map((x) => Math.floor(x));
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, r: e - Math.floor(e) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; k < rem; k++) {
    out[order[k]!.i]++;
  }
  return out;
}
