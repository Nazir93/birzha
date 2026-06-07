/** Сетевая ошибка fetch (без HTTP-ответа). */
export function isLikelyNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return msg.includes("fetch") || msg.includes("network");
  }
  return false;
}
