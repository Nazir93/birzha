import {
  InsufficientStockError,
  InvalidKgError,
} from "@birzha/domain";

import {
  BatchNotFoundError,
  InsufficientStockForTripError,
  SalePaymentSplitError,
  TripClosedError,
  TripNotFoundError,
  TripShortageExceedsNetError,
} from "../errors.js";

export type SyncRejectionFields = {
  reason: string;
  resolution: string;
  errorCode?: string;
  details?: Record<string, unknown>;
};

/** Маппинг доменных/прикладных ошибок в ответ синхронизации (без HTTP-кода). */
export function mapErrorToSyncRejection(error: unknown): SyncRejectionFields {
  if (error instanceof BatchNotFoundError) {
    return {
      reason: `Партия не найдена: ${error.batchId}`,
      resolution: "Обновите данные с сервера и проверьте идентификатор партии.",
      errorCode: "batch_not_found",
      details: { batchId: error.batchId },
    };
  }
  if (error instanceof TripNotFoundError) {
    return {
      reason: `Рейс не найден: ${error.tripId}`,
      resolution: "Синхронизируйте справочник рейсов или создайте рейс на сервере.",
      errorCode: "trip_not_found",
      details: { tripId: error.tripId },
    };
  }
  if (error instanceof TripClosedError) {
    return {
      reason: `Рейс закрыт для отгрузок: ${error.tripId}`,
      resolution: "Выберите другой рейс или обратитесь в офис.",
      errorCode: "trip_closed",
      details: { tripId: error.tripId },
    };
  }
  if (error instanceof InsufficientStockForTripError) {
    return {
      reason: `Недостаточно массы в рейсе по партии: доступно ${error.availableGrams} г, запрошено ${error.requestedGrams} г`,
      resolution: "Сверьте остаток по рейсу после последней синхронизации; уменьшите объём операции.",
      errorCode: "insufficient_stock_for_trip",
      details: {
        tripId: error.tripId,
        batchId: error.batchId,
        availableGrams: error.availableGrams.toString(),
        requestedGrams: error.requestedGrams.toString(),
      },
    };
  }
  if (error instanceof TripShortageExceedsNetError) {
    return {
      reason: `Недостача превышает остаток по рейсу: доступно ${error.availableGrams} г, запрошено ${error.requestedGrams} г`,
      resolution: "Проверьте уже учтённые продажи и недостачи по этой партии в рейсе.",
      errorCode: "trip_shortage_exceeds_net",
      details: {
        tripId: error.tripId,
        batchId: error.batchId,
        availableGrams: error.availableGrams.toString(),
        requestedGrams: error.requestedGrams.toString(),
      },
    };
  }
  if (error instanceof SalePaymentSplitError) {
    return {
      reason: error.message,
      resolution: "Исправьте разбиение нал/долг и повторите отправку.",
      errorCode: "sale_payment_split_invalid",
    };
  }
  if (error instanceof InsufficientStockError) {
    return {
      reason: error.message,
      resolution: "Сверьте фактический остаток на сервере и скорректируйте операцию.",
      errorCode: "insufficient_stock",
      details: {
        context: error.context,
        availableKg: error.availableKg,
        requestedKg: error.requestedKg,
      },
    };
  }
  if (error instanceof InvalidKgError) {
    return {
      reason: `Некорректная масса (${error.field}): ${String(error.value)}`,
      resolution: "Проверьте ввод килограммов.",
      errorCode: "invalid_kg",
      details: { field: error.field, value: error.value },
    };
  }
  if (error instanceof Error) {
    return {
      reason: error.message,
      resolution: "Обратитесь в офис или повторите попытку после обновления данных.",
      errorCode: "unknown_error",
    };
  }
  return {
    reason: "Неизвестная ошибка",
    resolution: "Повторите попытку позже.",
    errorCode: "unknown",
  };
}
