/**
 * Сумма строки накладной в копейках: кг × ₽/кг × 100.
 * Считается в целочисленной арифметике (без ошибок IEEE 754), округление половины вверх для неотрицательных сумм.
 */

function trimDecimalInput(raw: string): string {
  let t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (t.startsWith(".")) {
    t = `0${t}`;
  }
  return t;
}

/** Разбор неотрицательного десятичного числа из строки; дробная часть не длиннее maxFrac (лишнее отбрасывается). */
export function parseNonnegativeDecimalParts(
  raw: string,
  maxFrac: number,
): { intDigits: string; fracDigits: string } | null {
  const t = trimDecimalInput(raw);
  if (t === "" || !/^\d*\.?\d*$/.test(t) || t === ".") {
    return null;
  }
  const dot = t.indexOf(".");
  if (dot === -1) {
    if (!/^\d+$/.test(t)) {
      return null;
    }
    return { intDigits: t, fracDigits: "" };
  }
  const intDigits = t.slice(0, dot);
  let frac = t.slice(dot + 1).replace(/\D/g, "");
  if (frac.length > maxFrac) {
    frac = frac.slice(0, maxFrac);
  }
  return { intDigits: intDigits === "" ? "0" : intDigits, fracDigits: frac };
}

/** Целое = целая часть + дробная, без точки (масштаб = длина дробной части). */
function partsToScaledInt(intDigits: string, fracDigits: string): { num: bigint; scale: number } {
  const intNorm = intDigits.replace(/^0+/, "") === "" ? "0" : intDigits.replace(/^0+/, "");
  const combined = intNorm + fracDigits;
  const scale = fracDigits.length;
  return { num: BigInt(combined || "0"), scale };
}

/**
 * Копейки по строкам ввода кг и ₽/кг (как в форме накладной).
 * @param kgMaxFrac — знаков после запятой у массы (например 6)
 * @param priceMaxFrac — у цены за кг в рублях (например 4: копейки в цене)
 */
export function purchaseLineAmountKopecksFromDecimalStrings(
  kgRaw: string,
  pricePerKgRaw: string,
  opts: { kgMaxFrac: number; priceMaxFrac: number } = { kgMaxFrac: 6, priceMaxFrac: 4 },
): number {
  const kgP = parseNonnegativeDecimalParts(kgRaw, opts.kgMaxFrac);
  const prP = parseNonnegativeDecimalParts(pricePerKgRaw, opts.priceMaxFrac);
  if (!kgP || !prP) {
    return Number.NaN;
  }
  const kg = partsToScaledInt(kgP.intDigits, kgP.fracDigits);
  const pr = partsToScaledInt(prP.intDigits, prP.fracDigits);
  if (kg.num < 0n || pr.num < 0n) {
    return Number.NaN;
  }
  const numerator = kg.num * pr.num * 100n;
  const denom = 10n ** BigInt(kg.scale + pr.scale);
  if (denom === 0n) {
    return Number.NaN;
  }
  return Number((numerator + denom / 2n) / denom);
}

/**
 * Стабильная десятичная строка из числа JSON (для согласования ожидаемых копеек на сервере с телом запроса).
 */
export function numberToDecimalStringForKopecks(n: number, maxFrac: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return "";
  }
  let s = n.toFixed(maxFrac);
  if (s.includes(".")) {
    s = s.replace(/\.?0+$/, "");
  }
  return s === "" ? "0" : s;
}

/** Число для JSON из строки поля (та же логика масштаба, что и для копеек). */
export function nonnegativeDecimalStringToNumber(raw: string, maxFrac: number): number {
  const p = parseNonnegativeDecimalParts(raw, maxFrac);
  if (!p) {
    return Number.NaN;
  }
  const { num, scale } = partsToScaledInt(p.intDigits, p.fracDigits);
  return Number(num) / Number(10n ** BigInt(scale));
}
