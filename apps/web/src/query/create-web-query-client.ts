import { QueryClient } from "@tanstack/react-query";

import { emitMutationError } from "./mutation-error-bus.js";
import { QUERY_GC_MS, QUERY_STALE_LISTS_MS } from "./query-defaults.js";

/** Единая точка создания `QueryClient` для веба: дефолты списков + глобальная реакция на ошибки мутаций. */
export function createWebQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_LISTS_MS,
        gcTime: QUERY_GC_MS,
        refetchOnWindowFocus: false,
        /** Без сети не долбим API лишний раз; при персисте показываем последний успешный срез. */
        networkMode: "offlineFirst",
        retry: (failureCount) => {
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            return false;
          }
          return failureCount < 1;
        },
      },
      mutations: {
        onError: (error) => {
          emitMutationError(error);
        },
      },
    },
  });
}
