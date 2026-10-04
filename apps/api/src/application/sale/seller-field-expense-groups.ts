import { calendarYmdFromDate } from "../../format/calendar-date.js";
import type { SellerFieldExpenseRecord } from "../ports/seller-field-expense-repository.port.js";

export type SellerFieldExpenseGroupMode = "day" | "week" | "month";

export type SellerFieldExpenseGroup = {
  key: string;
  label: string;
  fromYmd: string;
  toYmd: string;
  totalKopecks: bigint;
  count: number;
};

function ymdFromDate(d: Date): string {
  return calendarYmdFromDate(d);
}

/** ISO week key: YYYY-Www (UTC). */
function isoWeekKey(d: Date): { key: string; fromYmd: string; toYmd: string } {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const weekYear = utc.getUTCFullYear();
  const key = `${weekYear}-W${String(weekNo).padStart(2, "0")}`;
  const thursday = utc;
  const monday = new Date(thursday);
  monday.setUTCDate(thursday.getUTCDate() - 3);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { key, fromYmd: ymdFromDate(monday), toYmd: ymdFromDate(sunday) };
}

function monthKey(d: Date): { key: string; fromYmd: string; toYmd: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const key = `${y}-${String(m + 1).padStart(2, "0")}`;
  const fromYmd = `${key}-01`;
  const last = new Date(Date.UTC(y, m + 1, 0));
  return { key, fromYmd, toYmd: ymdFromDate(last) };
}

/**
 * Группировка полевых трат по дню / ISO-неделе / месяцу (UTC-даты expense_date).
 */
export function groupSellerFieldExpenses(
  rows: SellerFieldExpenseRecord[],
  mode: SellerFieldExpenseGroupMode,
): SellerFieldExpenseGroup[] {
  const map = new Map<string, SellerFieldExpenseGroup>();
  for (const r of rows) {
    let meta: { key: string; fromYmd: string; toYmd: string; label: string };
    if (mode === "day") {
      const day = ymdFromDate(r.expenseDate);
      meta = { key: day, fromYmd: day, toYmd: day, label: day };
    } else if (mode === "week") {
      const w = isoWeekKey(r.expenseDate);
      meta = { ...w, label: `${w.fromYmd} — ${w.toYmd}` };
    } else {
      const m = monthKey(r.expenseDate);
      meta = { ...m, label: m.key };
    }
    const cur = map.get(meta.key);
    if (cur) {
      cur.totalKopecks += r.amountKopecks;
      cur.count += 1;
    } else {
      map.set(meta.key, {
        key: meta.key,
        label: meta.label,
        fromYmd: meta.fromYmd,
        toYmd: meta.toYmd,
        totalKopecks: r.amountKopecks,
        count: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

export function cashToHandOver(cashKopecks: bigint, fieldExpensesKopecks: bigint): bigint {
  return cashKopecks - fieldExpensesKopecks;
}
