import type { Trip } from "@birzha/domain";

import { calendarYmdFromDate } from "../../format/calendar-date.js";
import type { PurchaserExpenseRepository } from "../ports/purchaser-expense-repository.port.js";
import type { SellerFieldExpenseRepository } from "../ports/seller-field-expense-repository.port.js";
import type { TripExpenseRepository } from "../ports/trip-expense-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";

/** Точка ряда по дню: касса продаж, масса, расходы (копейки / граммы строками). */
export type AccountingDailyPoint = {
  day: string;
  revenueCashKopecks: string;
  revenueCardKopecks: string;
  revenueDebtKopecks: string;
  revenueTotalKopecks: string;
  soldGrams: string;
  expensesKopecks: string;
};

export type AccountingDailySeries = {
  from: string;
  to: string;
  days: AccountingDailyPoint[];
};

/** Не отдавать бесконечные ряды: при большем периоде берём последние N дней до `to`. */
export const ACCOUNTING_DAILY_MAX_DAYS = 400;

type DayAgg = {
  cash: bigint;
  card: bigint;
  debt: bigint;
  grams: bigint;
  expenses: bigint;
};

function emptyDay(): DayAgg {
  return { cash: 0n, card: 0n, debt: 0n, grams: 0n, expenses: 0n };
}

function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Все дни периода подряд (для непрерывной оси графика). */
export function enumerateYmdRange(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  let cur = fromYmd;
  while (cur <= toYmd && out.length <= ACCOUNTING_DAILY_MAX_DAYS) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

/** Период, обрезанный до `ACCOUNTING_DAILY_MAX_DAYS` дней, считая от `to`. */
export function clampDailyRange(fromYmd: string, toYmd: string): { fromYmd: string; toYmd: string } {
  const minFrom = addDaysYmd(toYmd, -(ACCOUNTING_DAILY_MAX_DAYS - 1));
  return { fromYmd: fromYmd < minFrom ? minFrom : fromYmd, toYmd };
}

function tripInScope(trip: Trip, destinationCode: string, tripId: string): boolean {
  if (tripId && trip.getId() !== tripId) {
    return false;
  }
  if (destinationCode && (trip.getDestinationCode() ?? "").trim() !== destinationCode) {
    return false;
  }
  return true;
}

/**
 * Ряд по дням для графиков сводки: продажи — по дате фиксации строки продажи,
 * расходы — по своей дате (рейсовые + полевые продавца + закупщика).
 * При выборке по региону/рейсу расходы закупщика (не привязаны к рейсу) не учитываются.
 */
export class AccountingDailySeriesUseCase {
  constructor(
    private readonly sales: TripSaleRepository,
    private readonly trips: TripRepository,
    private readonly tripExpenses: TripExpenseRepository | null,
    private readonly sellerFieldExpenses: SellerFieldExpenseRepository | null,
    private readonly purchaserExpenses: PurchaserExpenseRepository | null,
  ) {}

  async execute(input: {
    fromYmd: string;
    toYmd: string;
    destinationCode?: string;
    tripId?: string;
  }): Promise<AccountingDailySeries> {
    const { fromYmd, toYmd } = clampDailyRange(input.fromYmd, input.toYmd);
    const destinationCode = input.destinationCode?.trim() ?? "";
    const tripId = input.tripId?.trim() ?? "";
    const scoped = Boolean(destinationCode || tripId);

    const byDay = new Map<string, DayAgg>();
    for (const day of enumerateYmdRange(fromYmd, toYmd)) {
      byDay.set(day, emptyDay());
    }
    const bucket = (day: string): DayAgg | null => byDay.get(day) ?? null;

    const allTrips = await this.trips.list({ limit: 500, offset: 0, order: "departedAtDesc" });
    const trips = allTrips.filter((t) => tripInScope(t, destinationCode, tripId));

    for (const trip of trips) {
      await this.collectTrip(trip.getId(), bucket, fromYmd, toYmd);
    }

    if (!scoped && this.purchaserExpenses) {
      const rows = await this.purchaserExpenses.list({ fromYmd, toYmd });
      for (const e of rows) {
        const b = bucket(calendarYmdFromDate(e.expenseDate));
        if (b) {
          b.expenses += e.amountKopecks;
        }
      }
    }

    return {
      from: fromYmd,
      to: toYmd,
      days: [...byDay.entries()].map(([day, a]) => ({
        day,
        revenueCashKopecks: a.cash.toString(),
        revenueCardKopecks: a.card.toString(),
        revenueDebtKopecks: a.debt.toString(),
        revenueTotalKopecks: (a.cash + a.card + a.debt).toString(),
        soldGrams: a.grams.toString(),
        expensesKopecks: a.expenses.toString(),
      })),
    };
  }

  private async collectTrip(
    tripId: string,
    bucket: (day: string) => DayAgg | null,
    fromYmd: string,
    toYmd: string,
  ): Promise<void> {
    const lines = await this.sales.listLinesByTripId(tripId);
    for (const l of lines) {
      const b = bucket(calendarYmdFromDate(l.recordedAt));
      if (!b) {
        continue;
      }
      b.cash += l.cashKopecks;
      b.card += l.cardTransferKopecks;
      b.debt += l.debtKopecks;
      b.grams += l.grams;
    }
    if (this.tripExpenses) {
      for (const e of await this.tripExpenses.listByTripId(tripId)) {
        const b = bucket(calendarYmdFromDate(e.expenseDate));
        if (b) {
          b.expenses += e.amountKopecks;
        }
      }
    }
    if (this.sellerFieldExpenses) {
      for (const e of await this.sellerFieldExpenses.list({ tripId, fromYmd, toYmd })) {
        const b = bucket(calendarYmdFromDate(e.expenseDate));
        if (b) {
          b.expenses += e.amountKopecks;
        }
      }
    }
  }
}
