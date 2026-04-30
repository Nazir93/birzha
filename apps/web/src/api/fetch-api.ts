/**
 * HTTP к `/api`: `apiFetch`, `assertOkResponse`, `apiGetJson`, JSON POST/DELETE и варианты с **403**.
 * Для распределения партий и списания брака — `patchBatchAllocation`, `postBatchWarehouseWriteOffQualityReject`;
 * удаление рейса — `deleteTripById`.
 * Логин и прочие особые ответы — по-прежнему локальный разбор.
 */
/** Сессия: дублируем JWT из тела логина (cookie HttpOnly тоже уходит с `credentials: include`). */
export const API_TOKEN_STORAGE_KEY = "birzha_api_token";

type UnauthorizedListener = () => void;

const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Подписка на «сессия недействительна» (HTTP 401: очистка Bearer в storage и уведомление). Возвращает отписку. */
export function onApiUnauthorized(fn: UnauthorizedListener): () => void {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
}

function notifyUnauthorized(): void {
  for (const fn of unauthorizedListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function getStoredApiToken(): string | null {
  try {
    return sessionStorage.getItem(API_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredApiToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(API_TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(API_TOKEN_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Все запросы к `/api/*`: Same-Origin cookie + опционально Bearer. При **401** — очистка Bearer в storage и `notifyUnauthorized` (в т.ч. cookie-only сессия без записи в storage). */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getStoredApiToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
  if (res.status === 401) {
    setStoredApiToken(null);
    notifyUnauthorized();
  }
  return res;
}

/**
 * После `apiFetch`: при неуспешном статусе читает тело (text) и бросает `Error`.
 * При успехе тело не читает.
 */
export async function assertOkResponse(res: Response, contextLabel?: string): Promise<void> {
  if (res.ok) {
    return;
  }
  const detail = (await res.text()).trim();
  const msg = detail || `HTTP ${res.status}`;
  throw new Error(contextLabel ? `${contextLabel}: ${msg}` : msg);
}

export async function apiGetJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  await assertOkResponse(res, url);
  return res.json() as Promise<T>;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export async function apiPostJson(url: string, body: unknown): Promise<unknown> {
  const res = await apiFetch(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  await assertOkResponse(res, url);
  return res.json();
}

/**
 * POST JSON: при **403** — своё сообщение (типично «только admin/manager»), иначе как `apiPostJson`.
 */
export async function apiPostJsonOr403(url: string, body: unknown, messageOn403: string): Promise<unknown> {
  const res = await apiFetch(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (res.status === 403) {
    throw new Error(messageOn403);
  }
  await assertOkResponse(res, url);
  return res.json();
}

/** DELETE без тела; ошибки — через `assertOkResponse`. */
export async function apiDelete(url: string): Promise<void> {
  const res = await apiFetch(url, { method: "DELETE" });
  await assertOkResponse(res, url);
}

/** DELETE: при **403** — своё сообщение. */
export async function apiDeleteOr403(url: string, messageOn403: string): Promise<void> {
  const res = await apiFetch(url, { method: "DELETE" });
  if (res.status === 403) {
    throw new Error(messageOn403);
  }
  await assertOkResponse(res, url);
}

/**
 * `PATCH /api/batches/:id/allocation` — направление на складе (нужен PostgreSQL на API).
 * Сообщения — как в UI «Распределения».
 */
export async function patchBatchAllocation(
  batchId: string,
  body: { destination: string | null },
): Promise<void> {
  const url = `/api/batches/${encodeURIComponent(batchId)}/allocation`;
  const res = await apiFetch(url, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (res.status === 503) {
    throw new Error("Нужна PostgreSQL на сервере (распределение не доступно in-memory).");
  }
  if (res.status === 403) {
    throw new Error("Недостаточно прав (нужна роль закупки/склада/руководства).");
  }
  await assertOkResponse(res, url);
}

/**
 * `POST /api/batches/:id/warehouse-write-off` — списание брака с остатка.
 */
export async function postBatchWarehouseWriteOffQualityReject(batchId: string, kg: number): Promise<void> {
  const url = `/api/batches/${encodeURIComponent(batchId)}/warehouse-write-off`;
  const res = await apiFetch(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ kind: "quality_reject", kg }),
  });
  if (res.status === 503) {
    throw new Error("Нужна PostgreSQL (списание на складе не настроено).");
  }
  if (res.status === 409) {
    const t = (await res.json().catch(() => ({}))) as { message?: string };
    const msg =
      typeof t === "object" && t && "message" in t && t.message != null
        ? String(t.message)
        : "Недостаточно кг на остатке";
    throw new Error(msg);
  }
  if (res.status === 403) {
    throw new Error("Недостаточно прав (роль закупки/склада/руководства).");
  }
  await assertOkResponse(res, url);
}

/**
 * `DELETE /api/trips/:id` — права и конфликт 409 (рейс с движениями).
 */
export async function deleteTripById(tripId: string, messageOn403: string): Promise<void> {
  const url = `/api/trips/${encodeURIComponent(tripId)}`;
  const res = await apiFetch(url, { method: "DELETE" });
  if (res.status === 403) {
    throw new Error(messageOn403);
  }
  if (res.status === 409) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (j.error === "trip_not_empty") {
      throw new Error(
        "Нельзя удалить: в рейсе есть отгрузка, продажа или недостача. Сначала уберите движения в «Операциях» и отчётах.",
      );
    }
    if (j.message) {
      throw new Error(j.message);
    }
    throw new Error("Рейс нельзя удалить: есть движения по рейсу.");
  }
  await assertOkResponse(res, url);
}
