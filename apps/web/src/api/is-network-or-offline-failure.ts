/**
 * true, если запрос, скорее всего, не дошёл до сервера (офлайн, обрыв, DNS).
 * Не использовать для HTTP 4xx/5xx — там ответ есть, это бизнес/серверная ошибка.
 */
export function isLikelyNetworkOrOfflineFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  const msg = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/Failed to fetch|NetworkError|Load failed|network|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(msg)) {
    return true;
  }
  /** У fetch при обрыве чаще всего TypeError без явного «fetch» в сообщении. */
  if (error instanceof TypeError && (msg === "" || /fetch|network|load|abort/i.test(msg))) {
    return true;
  }
  return false;
}
