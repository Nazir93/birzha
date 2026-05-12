import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";

import {
  BIRZHA_PERSIST_MAX_AGE_MS,
  birzhaPersistDehydrateOptions,
  createBirzhaQueryPersister,
} from "./birzha-query-persist.js";

const skipPersist =
  import.meta.env.MODE === "test" ||
  import.meta.env.SSR === true ||
  typeof window === "undefined";

/**
 * В проде/деве: персистентный кэш списков в `localStorage` (рейсы, отчёты, партии, контрагенты).
 * В тестах и SSR: обычный `QueryClientProvider` без записи на диск.
 */
export function WebQueryProvider({ client, children }: { client: QueryClient; children: ReactNode }) {
  const persister = useMemo(() => {
    if (skipPersist) {
      return null;
    }
    try {
      return createBirzhaQueryPersister();
    } catch {
      return null;
    }
  }, []);

  if (persister) {
    return (
      <PersistQueryClientProvider
        client={client}
        persistOptions={{
          persister,
          maxAge: BIRZHA_PERSIST_MAX_AGE_MS,
          dehydrateOptions: birzhaPersistDehydrateOptions,
        }}
      >
        {children}
      </PersistQueryClientProvider>
    );
  }

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
