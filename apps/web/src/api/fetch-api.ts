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

export async function apiGetJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  if (!res.ok) {
    throw new Error(`${url} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPostJson(url: string, body: unknown): Promise<unknown> {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}
