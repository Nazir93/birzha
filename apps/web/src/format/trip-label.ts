import type { TripJson } from "../api/types.js";

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

/** Подпись рейса в селекторах: номер, статус, ТС/водитель при наличии, id. */
export function formatTripSelectLabel(t: TripJson): string {
  const bits: string[] = [t.tripNumber, `(${formatTripStatusLabel(t.status)})`];
  if (t.vehicleLabel) {
    bits.push(t.vehicleLabel);
  }
  if (t.driverName) {
    bits.push(t.driverName);
  }
  return `${bits.join(" ")} — ${t.id}`;
}
