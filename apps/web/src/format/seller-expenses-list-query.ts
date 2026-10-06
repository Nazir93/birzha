/** Дефолтный период списка трат: 90 дней назад → сегодня (сентябрь не «пропадает» в октябре). */
export function sellerExpensesDefaultDateRange(now: Date = new Date()): { from: string; to: string } {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(to);
  from.setDate(from.getDate() - 90);
  const ymd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { from: ymd(from), to: ymd(to) };
}

/**
 * Когда выбран конкретный рейс — не режем список дат (как в отчёте по рейсу).
 * Иначе оставляем фильтр периода.
 */
export function sellerExpensesListQueryParams(input: {
  tripId: string;
  from: string;
  to: string;
  group: "day" | "week" | "month";
}): URLSearchParams {
  const params = new URLSearchParams({ group: input.group });
  const tripId = input.tripId.trim();
  if (tripId) {
    params.set("tripId", tripId);
    return params;
  }
  if (input.from.trim()) {
    params.set("from", input.from.trim());
  }
  if (input.to.trim()) {
    params.set("to", input.to.trim());
  }
  return params;
}
