import type { TripJson } from "../api/types.js";

/** Подпись рейса в селекторах: номер, статус, ТС/водитель при наличии, id. */
export function formatTripSelectLabel(t: TripJson): string {
  const bits: string[] = [t.tripNumber, `(${t.status})`];
  if (t.vehicleLabel) {
    bits.push(t.vehicleLabel);
  }
  if (t.driverName) {
    bits.push(t.driverName);
  }
  return `${bits.join(" ")} — ${t.id}`;
}
