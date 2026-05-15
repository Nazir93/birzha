/** Последний успешный ответ `GET /api/meta` — чтобы PWA открывалась без сети (каркас + вход). */
export const LAST_API_META_SESSION_KEY = "birzha:last-api-meta-v1";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** Минимальная проверка JSON из sessionStorage перед использованием как ответ `/api/meta`. */
export function parseStoredApiMetaJson(raw: string): object | null {
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") {
      return null;
    }
    const o = j as Record<string, unknown>;
    if (
      !isNonEmptyString(o.name) ||
      !isNonEmptyString(o.batchesApi) ||
      !isNonEmptyString(o.tripsApi) ||
      !isNonEmptyString(o.tripShipmentLedger) ||
      !isNonEmptyString(o.tripSaleLedger) ||
      !isNonEmptyString(o.tripShortageLedger) ||
      !isNonEmptyString(o.syncApi) ||
      !isNonEmptyString(o.authApi) ||
      !isNonEmptyString(o.requireApiAuth)
    ) {
      return null;
    }
    return j;
  } catch {
    return null;
  }
}

export function readCachedApiMetaFromSession(): object | null {
  try {
    const raw = sessionStorage.getItem(LAST_API_META_SESSION_KEY);
    if (!raw) {
      return null;
    }
    return parseStoredApiMetaJson(raw);
  } catch {
    return null;
  }
}

export function writeCachedApiMetaToSession(meta: object): void {
  try {
    sessionStorage.setItem(LAST_API_META_SESSION_KEY, JSON.stringify(meta));
  } catch {
    /* ignore quota / private mode */
  }
}
