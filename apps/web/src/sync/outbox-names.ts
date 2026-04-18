/**
 * Имена хранилищ офлайн-очереди без привязки к текущей сессии (чистые функции).
 * `default` — прежнее поведение без входа (`birzha-offline`, ключ localStorage без суффикса).
 */

export function indexedDbNameForScope(scopeKey: string): string {
  if (scopeKey === "default") {
    return "birzha-offline";
  }
  const safe = scopeKey.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 48);
  return `birzha-offline-${safe}`;
}
