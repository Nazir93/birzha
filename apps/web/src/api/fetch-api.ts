import { combineAbortSignals } from "./abort-signal-utils.js";

/**
 * HTTP к `/api`: `apiFetch`, `assertOkResponse`, `apiGetJson`, JSON POST/DELETE и варианты с **403**.
 * Для распределения партий и списания брака — `patchBatchAllocation`, `postBatchWarehouseWriteOffQualityReject`;
 * удаление рейса — `deleteTripById`.
 * Логин и прочие особые ответы — по-прежнему локальный разбор.
 */

/** Максимум ожидания ответа по одному запросу к API (мс). Иначе «вечный» pending при обрыве сети/прокси. */
export const API_FETCH_TIMEOUT_MS = 120_000;

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
  const { signal: userSignal, ...restInit } = init ?? {};
  const headers = new Headers(restInit.headers);
  const token = getStoredApiToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const timeoutSignal = AbortSignal.timeout(API_FETCH_TIMEOUT_MS);
  const signal =
    userSignal == null ? timeoutSignal : combineAbortSignals(userSignal, timeoutSignal);
  const res = await fetch(input, {
    ...restInit,
    credentials: "include",
    headers,
    signal,
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
function messageFromErrorBody(detail: string, status: number): string {
  const trimmed = detail.trim();
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as { message?: string; error?: string };
      if (typeof j.message === "string" && j.message.trim()) {
        return j.message.trim();
      }
      if (typeof j.error === "string" && j.error.trim()) {
        return j.error.trim();
      }
    } catch {
      /* ignore */
    }
  }
  if (trimmed) {
    return trimmed;
  }
  if (status === 401) {
    return "Сессия истекла — войдите снова.";
  }
  if (status === 403) {
    return "Недостаточно прав для этого действия.";
  }
  if (status >= 500) {
    return "Сервер временно не отвечает. Подождите и повторите.";
  }
  return `Ошибка сервера (${status})`;
}

export async function assertOkResponse(res: Response, _contextLabel?: string): Promise<void> {
  if (res.ok) {
    return;
  }
  const detail = await res.text();
  const msg = messageFromErrorBody(detail, res.status);
  throw new Error(msg);
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
export async function postBatchWarehouseWriteOffQualityReject(
  batchId: string,
  kg: number,
): Promise<{ writeOffId: string }> {
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
  const body = (await res.json()) as { writeOffId?: string };
  const writeOffId = typeof body.writeOffId === "string" ? body.writeOffId.trim() : "";
  if (!writeOffId) {
    throw new Error("Сервер не вернул идентификатор списания.");
  }
  return { writeOffId };
}

/**
 * `DELETE /api/warehouse-write-offs/:id` — отмена последнего списания брака с остатка.
 */
export async function deleteWarehouseWriteOffById(writeOffId: string): Promise<void> {
  const url = `/api/warehouse-write-offs/${encodeURIComponent(writeOffId)}`;
  const res = await apiFetch(url, { method: "DELETE" });
  if (res.status === 503) {
    throw new Error("Нужна PostgreSQL (списание на складе не настроено).");
  }
  if (res.status === 403) {
    throw new Error("Недостаточно прав (роль закупки/склада/руководства).");
  }
  if (res.status === 404) {
    throw new Error("Запись списания не найдена — возможно, уже отменена.");
  }
  await assertOkResponse(res, url);
}

/**
 * `POST /api/trips/:id/close` — закрыть рейс (admin, manager, logistics).
 */
export async function closeTripById(tripId: string, messageOn403: string): Promise<void> {
  const url = `/api/trips/${encodeURIComponent(tripId)}/close`;
  const res = await apiFetch(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: "{}",
  });
  if (res.status === 403) {
    throw new Error(messageOn403);
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

/**
 * `DELETE /api/loading-manifests/:id` — только admin; 409 если товар уже в рейсе.
 */
export async function deleteLoadingManifestById(manifestId: string, messageOn403: string): Promise<void> {
  const url = `/api/loading-manifests/${encodeURIComponent(manifestId)}`;
  const res = await apiFetch(url, { method: "DELETE" });
  if (res.status === 403) {
    throw new Error(messageOn403);
  }
  if (res.status === 409) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (j.error === "loading_manifest_not_empty" && j.message) {
      throw new Error(j.message);
    }
    if (j.message) {
      throw new Error(j.message);
    }
    throw new Error("Погрузочную накладную нельзя удалить: товар уже отгружен в рейс.");
  }
  await assertOkResponse(res, url);
}

/** PATCH JSON: при **403** — своё сообщение; **409** — message из API. */
export async function apiPatchJsonOr403(url: string, body: unknown, messageOn403: string): Promise<void> {
  const res = await apiFetch(url, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (res.status === 403) {
    throw new Error(messageOn403);
  }
  if (res.status === 409) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (j.message) {
      throw new Error(j.message);
    }
  }
  await assertOkResponse(res, url);
}

export async function patchPurchaseDocumentHeader(
  documentId: string,
  body: { documentNumber?: string; docDate?: string },
  messageOn403: string,
): Promise<void> {
  await apiPatchJsonOr403(
    `/api/purchase-documents/${encodeURIComponent(documentId)}`,
    body,
    messageOn403,
  );
}

export async function patchLoadingManifestHeader(
  manifestId: string,
  body: { manifestNumber?: string; docDate?: string },
  messageOn403: string,
): Promise<void> {
  await apiPatchJsonOr403(
    `/api/loading-manifests/${encodeURIComponent(manifestId)}`,
    body,
    messageOn403,
  );
}

export async function patchTripHeader(
  tripId: string,
  body: {
    tripNumber?: string;
    vehicleLabel?: string | null;
    driverName?: string | null;
    departedAt?: string | null;
  },
  messageOn403: string,
): Promise<void> {
  await apiPatchJsonOr403(`/api/trips/${encodeURIComponent(tripId)}`, body, messageOn403);
}
