/** Удаление погрузочных накладных при очистке закрытого рейса из архива. */
export interface TripArchiveManifestCleanupPort {
  deleteManifestsByTripId(tripId: string): Promise<void>;
}
