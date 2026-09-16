/**
 * URL отчёта по рейсу: без trip — выбор, с trip — открытый отчёт.
 * Два шага в history (`/reports` → `/reports?trip=`) дают корректный «Назад».
 */
export function tripReportHref(reportsPath: string, tripId?: string | null): string {
  const base = reportsPath.trim() || "/";
  const id = tripId?.trim() ?? "";
  if (!id) {
    return base;
  }
  return `${base}?${new URLSearchParams({ trip: id }).toString()}`;
}
