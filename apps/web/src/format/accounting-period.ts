/** Границы текущего месяца (UTC, YYYY-MM-DD). */
export function accountingMonthBounds(now = new Date()): { from: string; to: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export function accountingPeriodSearch(from: string, to: string): string {
  return new URLSearchParams({ from, to }).toString();
}

export function accountingPathWithPeriod(path: string, from: string, to: string): string {
  return `${path}?${accountingPeriodSearch(from, to)}`;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function readAccountingPeriodParams(
  search: URLSearchParams,
  fallback: { from: string; to: string },
): { from: string; to: string } {
  const from = search.get("from") ?? "";
  const to = search.get("to") ?? "";
  return {
    from: YMD.test(from) ? from : fallback.from,
    to: YMD.test(to) ? to : fallback.to,
  };
}
