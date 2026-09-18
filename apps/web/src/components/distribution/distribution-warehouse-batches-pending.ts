/** Пока партии склада не пришли в этом заходе на экран, старый кэш не считаем готовым. */
export function distributionWarehouseBatchesPending(input: {
  warehousesLoaded: boolean;
  queries: readonly { isPending: boolean; isFetchedAfterMount: boolean }[];
}): boolean {
  if (!input.warehousesLoaded) {
    return true;
  }
  return input.queries.some((query) => query.isPending || !query.isFetchedAfterMount);
}
