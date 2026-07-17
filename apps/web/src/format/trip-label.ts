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

/** Следующий порядковый № рейса (01, 02, …). При `destinationCode` — только среди рейсов этого города. */
export function suggestNextTripNumber(
  trips: readonly { tripNumber: string; destinationCode?: string | null }[],
  destinationCode?: string | null,
): string {
  const dest = destinationCode?.trim() || "";
  const scoped = dest
    ? trips.filter((t) => (t.destinationCode?.trim() || "") === dest)
    : trips;
  let max = 0;
  for (const t of scoped) {
    const m = /^(\d+)/.exec(t.tripNumber.trim());
    if (!m) {
      continue;
    }
    const n = Number.parseInt(m[1]!, 10);
    if (Number.isFinite(n) && n > max) {
      max = n;
    }
  }
  const next = max + 1;
  return next < 10 ? `0${next}` : String(next);
}

/** Подпись рейса для UI: водитель · машина · дата (без отдельного «номера рейса»). */
export function buildTripDisplayNumber(input: {
  driverName?: string | null;
  vehicleLabel?: string | null;
  departedAt?: string | null;
}): string {
  const parts: string[] = [];
  const dr = input.driverName?.trim();
  const vl = input.vehicleLabel?.trim();
  if (dr) {
    parts.push(dr);
  }
  if (vl) {
    parts.push(vl);
  }
  const dep = input.departedAt?.trim();
  if (dep) {
    const ms = Date.parse(dep);
    if (!Number.isNaN(ms)) {
      parts.push(
        new Date(ms).toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
      );
    }
  }
  if (parts.length === 0) {
    return "Рейс";
  }
  return parts.join(" · ");
}

/** Дата/время отправления для таблиц. */
export function formatTripDepartedAtRu(iso: string | null | undefined): string {
  if (!iso?.trim()) {
    return "—";
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return "—";
  }
  return new Date(ms).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Опции подписи рейса в `<select>` и списках. */
export type FormatTripSelectLabelOptions = {
  /** Показывать технический id в конце (только для отладки; в UI не используем). */
  includeTechnicalId?: boolean;
  /** Номера погрузочных накладных, привязанных к рейсу. */
  linkedManifestNumbers?: readonly string[];
};

/** Хвост подписи рейса: привязанные погрузочные накладные. */
export function formatLinkedManifestsTripSelectSuffix(manifestNumbers: readonly string[]): string {
  if (manifestNumbers.length === 0) {
    return "";
  }
  if (manifestNumbers.length === 1) {
    return ` · ПН ${manifestNumbers[0]}`;
  }
  const shown = manifestNumbers.slice(0, 2).join(", ");
  const extra = manifestNumbers.length > 2 ? ` +${manifestNumbers.length - 2}` : "";
  return ` · ПН: ${shown}${extra}`;
}

/** Подпись рейса в селекторах: №, водитель, машина, дата, статус. */
export function formatTripSelectLabel(t: TripJson, opts?: FormatTripSelectLabelOptions): string {
  const num = t.tripNumber.trim();
  const display = buildTripDisplayNumber(t);
  const head =
    display === "Рейс"
      ? num || "Рейс"
      : num && !display.startsWith(num)
        ? `${num} · ${display}`
        : display;
  let label = `${head} (${formatTripListStatusLabel(t)})`;
  label += formatLinkedManifestsTripSelectSuffix(opts?.linkedManifestNumbers ?? []);
  if (opts?.includeTechnicalId === true) {
    return `${label} — ${t.id}`;
  }
  return label;
}
