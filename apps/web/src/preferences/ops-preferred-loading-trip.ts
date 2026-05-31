const TRIP_KEY = "birzha.ops.preferredLoadingTripId";
const DEST_KEY = "birzha.ops.preferredLoadingDestinationCode";

/** Рейс для следующей погрузочной (несколько ПН с разных складов → один рейс). */
export function readPreferredLoadingTripId(): string | null {
  try {
    const raw = globalThis.localStorage?.getItem(TRIP_KEY);
    if (raw == null || raw.trim() === "") {
      return null;
    }
    return raw.trim();
  } catch {
    return null;
  }
}

export function writePreferredLoadingTripId(tripId: string | null): void {
  try {
    if (tripId == null || tripId.trim() === "") {
      globalThis.localStorage?.removeItem(TRIP_KEY);
      return;
    }
    globalThis.localStorage?.setItem(TRIP_KEY, tripId.trim());
  } catch {
    /* ignore */
  }
}

export function readPreferredLoadingDestinationCode(): string | null {
  try {
    const raw = globalThis.localStorage?.getItem(DEST_KEY);
    if (raw == null || raw.trim() === "") {
      return null;
    }
    return raw.trim();
  } catch {
    return null;
  }
}

export function writePreferredLoadingDestinationCode(code: string | null): void {
  try {
    if (code == null || code.trim() === "") {
      globalThis.localStorage?.removeItem(DEST_KEY);
      return;
    }
    globalThis.localStorage?.setItem(DEST_KEY, code.trim());
  } catch {
    /* ignore */
  }
}
