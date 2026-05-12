import type { ShipmentReportResponse, TripJson } from "../api/types.js";

import { buildTripBatchRows } from "./trip-report-rows.js";

/** По данным отчёта: открытый рейс, отгрузка была, остатка «в пути» нет. */
export function tripReportShowsSoldOut(r: ShipmentReportResponse): boolean {
  if (r.trip.status !== "open") {
    return false;
  }
  const rows = buildTripBatchRows(r);
  if (!rows.some((x) => x.shippedG > 0n)) {
    return false;
  }
  return !rows.some((x) => x.netTransitG > 0n);
}

/** Статус рейса в шапке отчёта (учитывает «Продан» по строкам отчёта). */
export function formatTripReportStatusLabel(r: ShipmentReportResponse): string {
  if (r.trip.status === "closed") {
    return "Закрыт";
  }
  if (tripReportShowsSoldOut(r)) {
    return "Продан";
  }
  return formatTripStatusLabel(r.trip.status);
}

/** Полный список рейсов: «всё продано с машины», но рейс ещё не закрыт в учёте. */
export function tripListShowsSoldOut(t: TripJson): boolean {
  return (
    t.status === "open" &&
    t.hasShipmentToTrip === true &&
    t.transitRemainingGrams === "0"
  );
}

/** Подпись статуса в списках админки / отчётах (учитывает «Продан» по остатку в пути). */
export function formatTripListStatusLabel(t: TripJson): string {
  if (t.status === "closed") {
    return "Закрыт";
  }
  if (tripListShowsSoldOut(t)) {
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

/** Подпись рейса в селекторах: номер, статус, дата выезда (если есть), ТС/водитель, id. */
export function formatTripSelectLabel(t: TripJson): string {
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
  return `${bits.join(" ")} — ${t.id}`;
}
