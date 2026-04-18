import type { TripBatchTableRow } from "./trip-report-rows.js";

/** Экранирование поля для CSV (разделитель `;`, Excel RU). */
export function escapeCsvField(value: string): string {
  if (/["\r\n;]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type TripBatchCsvOptions = {
  tripNumber: string;
  tripId: string;
};

/**
 * UTF-8 с BOM — чтобы Excel корректно открыл кириллицу.
 * Разделитель `;` — типичная локаль RU.
 */
export function tripBatchRowsToCsv(rows: TripBatchTableRow[], options: TripBatchCsvOptions): string {
  const lines: string[] = [];
  lines.push(`Рейс;${escapeCsvField(options.tripNumber)}`);
  lines.push(`ID рейса;${escapeCsvField(options.tripId)}`);
  lines.push("");
  lines.push(
    [
      "Партия_id",
      "Отгружено_г",
      "Продано_г",
      "Недостача_г",
      "Остаток_в_пути_г",
      "Выручка_коп",
      "Наличные_коп",
      "Долг_коп",
    ].join(";"),
  );
  for (const row of rows) {
    lines.push(
      [
        escapeCsvField(row.batchId),
        row.shippedG.toString(),
        row.soldG.toString(),
        row.shortageG.toString(),
        row.netTransitG.toString(),
        row.revenueK.toString(),
        row.cashK.toString(),
        row.debtK.toString(),
      ].join(";"),
    );
  }
  return `\uFEFF${lines.join("\r\n")}`;
}
