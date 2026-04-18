const SESSION_SCOPE_KEY = "birzha:activeOutboxScope";

function readScopeFromSession(): string {
  try {
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage.getItem(SESSION_SCOPE_KEY) ?? "default";
    }
  } catch {
    /* ignore */
  }
  return "default";
}

let currentScopeKey = readScopeFromSession();

export function getOutboxScopeKey(): string {
  return currentScopeKey;
}

/**
 * Устанавливает область хранения очереди (пользователь / без входа / anon).
 * @returns `true`, если область сменилась и нужно сбросить кэш IDB/бэкенда.
 */
export function syncOutboxScopeTo(nextScopeKey: string): boolean {
  if (nextScopeKey === currentScopeKey) {
    return false;
  }
  currentScopeKey = nextScopeKey;
  try {
    sessionStorage.setItem(SESSION_SCOPE_KEY, nextScopeKey);
  } catch {
    /* ignore */
  }
  return true;
}

/** Соответствие области входу: без API-авторизации — общая `default`; с входом — отдельная БД на пользователя. */
export function resolveOutboxScopeKey(authApiEnabled: boolean, userId: string | undefined): string {
  if (!authApiEnabled) {
    return "default";
  }
  if (userId) {
    return `user:${userId}`;
  }
  return "anon";
}
