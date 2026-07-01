/** Канонический порядок калибров в накладных и сводках (5 → 6 → 7 → 8 → НС+ → НС- → ОМ). */
export const CANONICAL_PRODUCT_GRADE_ORDER = ["5", "6", "7", "8", "НС+", "НС-", "ОМ"] as const;

const GRADE_RANK = new Map<string, number>(
  CANONICAL_PRODUCT_GRADE_ORDER.map((code, index) => [code, index]),
);

/** Нормализует код калибра для сравнения (`№5` → `5`, `Ом.` → `ОМ`). */
export function normalizeProductGradeCodeForSort(raw: string): string {
  let s = raw.trim();
  if (!s) {
    return "";
  }
  if (s.startsWith("№")) {
    s = s.slice(1).trim();
  }
  const upper = s.toUpperCase();
  if (upper === "ОМ." || upper === "OM." || upper === "OM") {
    return "ОМ";
  }
  if (upper === "HC+" || s === "НС+" || s === "нс+") {
    return "НС+";
  }
  if (upper === "HC-" || s === "НС-" || s === "нс-") {
    return "НС-";
  }
  return s;
}

/** Ранг калибра для сортировки; неизвестные коды — в конце. */
export function productGradeSortRank(code: string): number {
  const normalized = normalizeProductGradeCodeForSort(code);
  return GRADE_RANK.get(normalized) ?? 1000;
}

/** Сравнение двух кодов калибра по каноническому порядку. */
export function compareProductGradeCodes(a: string, b: string): number {
  const ra = productGradeSortRank(a);
  const rb = productGradeSortRank(b);
  if (ra !== rb) {
    return ra - rb;
  }
  return a.trim().localeCompare(b.trim(), "ru", { sensitivity: "base" });
}

const LINE_LABEL_SEP = " · ";

/** Извлекает код калибра из подписи вида «Помидоры · №5». */
export function extractProductGradeCodeFromLineLabel(lineLabel: string): string {
  const idx = lineLabel.lastIndexOf(LINE_LABEL_SEP);
  if (idx >= 0) {
    return lineLabel.slice(idx + LINE_LABEL_SEP.length).trim();
  }
  return lineLabel.trim();
}

/** Сравнение строк «товар · калибр»: сначала товар, затем калибр по канону. */
export function compareProductGradeLineLabels(a: string, b: string): number {
  const productA = a.includes(LINE_LABEL_SEP) ? a.slice(0, a.lastIndexOf(LINE_LABEL_SEP)).trim() : "";
  const productB = b.includes(LINE_LABEL_SEP) ? b.slice(0, b.lastIndexOf(LINE_LABEL_SEP)).trim() : "";
  if (productA !== productB) {
    return productA.localeCompare(productB, "ru");
  }
  return compareProductGradeCodes(
    extractProductGradeCodeFromLineLabel(a),
    extractProductGradeCodeFromLineLabel(b),
  );
}
