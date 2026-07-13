/**
 * Документные даты с API (`YYYY-MM-DD`) и отображение на экране.
 * Порядок всегда: день → месяц → год (ДД.ММ.ГГГГ).
 */

/** ISO `YYYY-MM-DD` → `ДД.ММ.ГГГГ`; иначе исходная строка или «—». */
export function formatPurchaseDocDateRu(docDate: string): string {
  const trimmed = docDate.trim();
  if (!trimmed) {
    return "—";
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (m) {
    return `${m[3]}.${m[2]}.${m[1]}`;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    return trimmed;
  }
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Обратное: `ДД.ММ.ГГГГ` или уже ISO → ISO `YYYY-MM-DD`, иначе null. */
export function parseDocDateToIso(raw: string): string | null {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return t;
  }
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (!m) {
    return null;
  }
  const d = m[1]!.padStart(2, "0");
  const mo = m[2]!.padStart(2, "0");
  const y = m[3]!;
  const check = new Date(Number(y), Number(mo) - 1, Number(d));
  if (check.getFullYear() !== Number(y) || check.getMonth() !== Number(mo) - 1 || check.getDate() !== Number(d)) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}
