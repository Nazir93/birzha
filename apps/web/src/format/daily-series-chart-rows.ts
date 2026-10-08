import type { AccountingDailyPoint } from "../api/types.js";

/** Строка для recharts: деньги — в рублях (число), масса — в кг. */
export type DailyChartRow = {
  day: string;
  /** «08.10» для оси X. */
  label: string;
  revenueRub: number;
  cashRub: number;
  cardRub: number;
  debtRub: number;
  expensesRub: number;
  soldKg: number;
};

function kopecksToRubNumber(kopecks: string): number {
  const n = BigInt(kopecks || "0");
  return Number(n) / 100;
}

function gramsToKgNumber(grams: string): number {
  const n = BigInt(grams || "0");
  return Number(n) / 1000;
}

export function dayAxisLabel(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return m && d ? `${d}.${m}` : ymd;
}

export function dailyChartRows(points: AccountingDailyPoint[]): DailyChartRow[] {
  return points.map((p) => ({
    day: p.day,
    label: dayAxisLabel(p.day),
    revenueRub: kopecksToRubNumber(p.revenueTotalKopecks),
    cashRub: kopecksToRubNumber(p.revenueCashKopecks),
    cardRub: kopecksToRubNumber(p.revenueCardKopecks),
    debtRub: kopecksToRubNumber(p.revenueDebtKopecks),
    expensesRub: kopecksToRubNumber(p.expensesKopecks),
    soldKg: gramsToKgNumber(p.soldGrams),
  }));
}

export function hasAnyDailyActivity(rows: DailyChartRow[]): boolean {
  return rows.some((r) => r.revenueRub !== 0 || r.expensesRub !== 0 || r.soldKg !== 0);
}

/** Компактная подпись оси Y: 12 500 → «12,5 тыс», 2 300 000 → «2,3 млн». */
export function compactRubTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} тыс`;
  }
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

export function formatRubTooltip(value: number): string {
  return `${value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

export function formatKgTooltip(value: number): string {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг`;
}
