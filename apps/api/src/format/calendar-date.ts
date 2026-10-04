/** Календарный день YYYY-MM-DD без сдвига часового пояса. */

export function parseCalendarYmdUtcNoon(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

/**
 * Дата из колонки `date` (JS Date: полночь UTC, полдень UTC или полночь локали).
 */
export function calendarYmdFromDate(d: Date): string {
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const utcHours = d.getUTCHours();
  if (utcHours === 12 || utcHours === 0) {
    return d.toISOString().slice(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
