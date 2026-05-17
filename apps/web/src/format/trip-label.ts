import type { ShipmentReportResponse, TripJson } from "../api/types.js";

import { buildTripBatchRows } from "./trip-report-rows.js";

/** По отчёту: была отгрузка и погруженный остаток в рейсе нулевой. */
export function tripReportFullySold(r: ShipmentReportResponse): boolean {
  const rows = buildTripBatchRows(r);
  if (!rows.some((x) => x.shippedG > 0n)) {
    return false;
  }
  return !rows.some((x) => x.netTransitG > 0n);
}

/** Открытый рейс с нулём в машине (ещё не закрыт в учёте). */
export function tripReportShowsSoldOut(r: ShipmentReportResponse): boolean {
  return r.trip.status === "open" && tripReportFullySold(r);
}

/** Статус рейса в шапке отчёта. */
export function formatTripReportStatusLabel(r: ShipmentReportResponse): string {
  const soldOut = tripReportFullySold(r);
  if (r.trip.status === "closed") {
    return soldOut ? "Закрыт · Продан" : "Закрыт";
  }
  if (soldOut) {
    return "Продан";
  }
  return formatTripStatusLabel(r.trip.status);
}

/** Сводка списка рейсов: отгрузка была, остатка в рейсе нет. */
export function tripListFullySold(t: TripJson): boolean {
  return t.hasShipmentToTrip === true && t.transitRemainingGrams === "0";
}

/** Открытый рейс, всё продано с машины, но в БД ещё «open». */
export function tripListShowsSoldOut(t: TripJson): boolean {
  return t.status === "open" && tripListFullySold(t);
}

/** Подпись статуса в списках админки. */
export function formatTripListStatusLabel(t: TripJson): string {
  const soldOut = tripListFullySold(t);
  if (t.status === "closed") {
    return soldOut ? "Закрыт · Продан" : "Закрыт";
  }
  if (soldOut) {
    return "Продан";
  }
  return formatTripStatusLabel(t.status);
}

/** Внутренний статус рейса из API → русская подпись в интерфейсе. */
export function formatTripStatusLabel(status: string): string {
  if (status === "open") {
    return "Открыт";
  }
  if (status === "closed") {
    return "Закрыт";
  }
  return status;
}

/** Опции подписи рейса в `<select>` и списках. */
export type FormatTripSelectLabelOptions = {
  /** Показывать технический id в конце (только для отладки; в UI не используем). */
  includeTechnicalId?: boolean;
};

/** Подпись рейса в селекторах: номер, статус, дата выезда (если есть), ТС/водитель. */
export function formatTripSelectLabel(t: TripJson, opts?: FormatTripSelectLabelOptions): string {
  const bits: string[] = [t.tripNumber, `(${formatTripListStatusLabel(t)})`];
  if (t.departedAt) {
    const ms = Date.parse(t.departedAt);
    if (!Number.isNaN(ms)) {
      bits.push(
        new Date(ms).toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
      );
    }
  }
  if (t.vehicleLabel) {
    bits.push(t.vehicleLabel);
  }
  if (t.driverName) {
    bits.push(t.driverName);
  }
  const head = bits.join(" ");
  if (opts?.includeTechnicalId === true) {
    return `${head} — ${t.id}`;
  }
  return head;
}
