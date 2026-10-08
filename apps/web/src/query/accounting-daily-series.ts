import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { apiGetJson } from "../api/fetch-api.js";
import type { AccountingDailySeries } from "../api/types.js";

export type AccountingDailySeriesParams = {
  from: string;
  to: string;
  destinationCode?: string;
  tripId?: string;
};

/**
 * Ряд по дням для графиков сводки.
 * Ключ начинается с `["accounting", "period-summary"]`, чтобы существующие
 * `invalidateQueries` после продаж/расходов обновляли и график.
 */
export const accountingDailySeriesQueryOptions = ({ from, to, destinationCode, tripId }: AccountingDailySeriesParams) => {
  const dest = destinationCode?.trim() ?? "";
  const trip = tripId?.trim() ?? "";
  return queryOptions({
    queryKey: ["accounting", "period-summary", "daily", from, to, dest, trip] as const,
    queryFn: () => {
      const p = new URLSearchParams({ from, to });
      if (dest) {
        p.set("destinationCode", dest);
      }
      if (trip) {
        p.set("tripId", trip);
      }
      return apiGetJson<AccountingDailySeries>(`/api/accounting/period-daily?${p}`);
    },
    placeholderData: keepPreviousData,
  });
};
