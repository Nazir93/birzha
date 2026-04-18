/** Как в `apps/web/src/format/money.ts` — для проверок UI без импорта из пакета web. */
export function kopecksToRubLabel(kopecks: string): string {
  const n = BigInt(kopecks);
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  const rub = abs / 100n;
  const kop = abs % 100n;
  const kopStr = kop < 10n ? `0${kop}` : `${kop}`;
  return `${sign}${rub.toString()},${kopStr}`;
}
