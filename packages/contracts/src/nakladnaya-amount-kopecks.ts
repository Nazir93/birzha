/**
 * Сумма в копейках из поля накладной (и доп. расходы).
 * - **Только цифры** (без `,` и `.`) — ввод **в копейках** целиком (как 50000).
 * - **С запятой** — **рубли,коп** (русская запись, например `32232,77` → 3 223 277 коп.).
 * - **С одной точкой** — так же, как `,` (рубли,коп), на случай `32232.77` с клавиатуры.
 * Дробь рубля — 1–2 цифры: одна цифра означает десятые рубля (`0,5` = 0,50 ₽ = 50 коп).
 */

const NBSP = /\s|\u00A0/gu;

/**
 * 1–2 цифры в дроби рубля → 0..99 (копейки в строке).
 * «5» → 50, «0»/«00» → 0, «5»+pad для одной цифры: десятки коп. из десятой рубля.
 */
function fractionDigitsToKopInt(frac: string): number | null {
  if (frac.length === 0) {
    return 0;
  }
  if (!/^\d+$/.test(frac) || frac.length > 2) {
    return null;
  }
  if (frac.length === 1) {
    return parseInt(frac, 10) * 10;
  }
  return parseInt(frac, 10);
}

/**
 * @returns целое число копеек, либо `null` (пусто или нельзя разобрать)
 */
export function kopecksFromNakladnayaAmountField(raw: string): number | null {
  const t0 = raw.trim();
  if (t0 === "") {
    return null;
  }
  const s = t0.replace(NBSP, "");
  if (s.length === 0) {
    return null;
  }
  if (s.startsWith("-")) {
    return null;
  }

  // Только цифры (без сепараторов) — ввод в копейках
  if (!/[,.]/.test(s)) {
    if (!/^\d+$/.test(s)) {
      return null;
    }
    if (s.length > 15) {
      return null;
    }
    try {
      const b = BigInt(s);
      if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < 0n) {
        return null;
      }
      return Number(b);
    } catch {
      return null;
    }
  }

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    return null;
  }
  if ((hasComma ? s.match(/,/g)?.length : s.match(/\./g)?.length) !== 1) {
    return null;
  }

  const sep = hasComma ? "," : ".";
  const parts = s.split(sep);
  if (parts.length !== 2) {
    return null;
  }
  const wholeS = (parts[0] ?? "").trim();
  const fracS = (parts[1] ?? "").trim();
  if (!/^\d+$/.test(wholeS)) {
    return null;
  }
  if (fracS.length > 2) {
    return null;
  }
  const partK = fractionDigitsToKopInt(fracS);
  if (partK === null) {
    return null;
  }
  if (partK < 0 || partK > 99) {
    return null;
  }
  if (wholeS.length > 15) {
    return null;
  }
  try {
    const rubB = BigInt(wholeS);
    const out = rubB * 100n + BigInt(partK);
    if (out < 0n || out > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    return Number(out);
  } catch {
    return null;
  }
}

/** Сумма для футеров/итогов: пусто → 0, иначе коп. или `0` при невалидном. */
export function kopecksFromNakladnayaAmountFieldForSum(raw: string): number {
  return kopecksFromNakladnayaAmountField(raw) ?? 0;
}

/**
 * Копейки (целое) → отображаем в поле в привычном виде «руб,коп».
 */
export function kopecksToNakladnayaRubleFieldString(kopecks: number): string {
  if (!Number.isFinite(kopecks) || kopecks < 0 || kopecks > Number.MAX_SAFE_INTEGER || !Number.isInteger(kopecks)) {
    return "";
  }
  const b = BigInt(kopecks);
  const rub = b / 100n;
  const cop = b % 100n;
  const c = String(cop).padStart(2, "0");
  return `${rub},${c}`;
}
