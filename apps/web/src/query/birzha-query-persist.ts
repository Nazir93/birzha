import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { DehydrateOptions, Query } from "@tanstack/react-query";

/** 14 дней: полевой телефон может долго быть без полного «сброса» кэша. */
export const BIRZHA_PERSIST_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const STORAGE_KEY = "birzha-react-query-v1";

/** Корни `queryKey`, которые кэшируем для офлайн-чтения (остальное не трогаем — объём и чувствительные данные). */
const PERSIST_QUERY_ROOTS = new Set(["trips", "shipment-report", "counterparties", "batches"]);

export function shouldPersistBirzhaQuery(query: Query): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || typeof key[0] !== "string") {
    return false;
  }
  return PERSIST_QUERY_ROOTS.has(key[0]);
}

export const birzhaPersistDehydrateOptions: DehydrateOptions = {
  shouldDehydrateQuery: (query) => query.state.status === "success" && shouldPersistBirzhaQuery(query),
};

export function createBirzhaQueryPersister() {
  return createSyncStoragePersister({
    storage: window.localStorage,
    key: STORAGE_KEY,
  });
}
