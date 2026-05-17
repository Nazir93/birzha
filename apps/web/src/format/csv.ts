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
  /** Накладная · товар · калибр (если задано — в CSV только человекочитаемые колонки). */
  batchCaption?: (batchId: string) => string;
};

/**
 * UTF-8 с BOM — чтобы Excel корректно открыл кириллицу.
 * Разделитель `;` — типичная локаль RU.
 */
export function tripBatchRowsToCsv(rows: TripBatchTableRow[], options: TripBatchCsvOptions): string {
  const lines: string[] = [];
  lines.push(`Рейс;${escapeCsvField(options.tripNumber)}`);
  lines.push("");
  const header = [
    ...(options.batchCaption ? (["Товар_калибр"] as const) : ["Партия"]),
    "Отгружено_г",
    "Отгружено_ящ",
    "Продано_г",
    "Недостача_г",
    "Остаток_в_пути_г",
    "Выручка_коп",
    "Наличные_коп",
    "Перевод_на_карту_коп",
    "Долг_коп",
  ];
  lines.push(header.join(";"));
  for (const row of rows) {
    const cap = options.batchCaption?.(row.batchId) ?? "";
    const cells = [
      ...(options.batchCaption ? [escapeCsvField(cap)] : [escapeCsvField(cap || "—")]),
      row.shippedG.toString(),
      row.shippedPackages.toString(),
      row.soldG.toString(),
      row.shortageG.toString(),
      row.netTransitG.toString(),
      row.revenueK.toString(),
      row.cashK.toString(),
      row.cardTransferK.toString(),
      row.debtK.toString(),
    ];
    lines.push(cells.join(";"));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}
