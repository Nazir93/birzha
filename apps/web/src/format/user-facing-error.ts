/** Понятные подписи вместо технических кодов API. */
const ERROR_CODE_RU: Record<string, string> = {
  trip_not_found: "Рейс не найден.",
  trip_not_empty: "Нельзя удалить рейс: есть отгрузка, продажа или недостача.",
  batch_not_found: "Партия не найдена.",
  forbidden: "Недостаточно прав для этого действия.",
  wholesaler_not_found: "Оптовик не найден — выберите другого из списка.",
  counterparty_not_found: "Контрагент не найден.",
  insufficient_stock: "Недостаточно товара в машине по выбранному калибру.",
};

function tryParseApiJson(text: string): string | null {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) {
    return null;
  }
  try {
    const j = JSON.parse(t) as { message?: string; error?: string };
    if (typeof j.message === "string" && j.message.trim()) {
      return j.message.trim();
    }
    if (typeof j.error === "string" && j.error.trim()) {
      return ERROR_CODE_RU[j.error.trim()] ?? j.error.trim();
    }
  } catch {
    return null;
  }
  return null;
}

/** Убирает префикс URL из `assertOkResponse` и похожих сообщений. */
function stripUrlPrefix(text: string): string {
  return text.replace(/^\/api\/\S+:\s*/i, "").trim();
}

/**
 * Текст ошибки для пользователя: без сырого JSON, с подсказками по типовым сбоям.
 */
export function humanizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message.trim() : String(error ?? "").trim();
  if (!raw) {
    return "Произошла ошибка. Попробуйте ещё раз.";
  }

  const withoutUrl = stripUrlPrefix(raw);
  const fromJson = tryParseApiJson(withoutUrl);
  if (fromJson) {
    return fromJson;
  }

  const lower = withoutUrl.toLowerCase();

  if (/failed to fetch|networkerror|load failed|network request failed|aborted/.test(lower)) {
    return "Нет связи с сервером. Проверьте интернет и повторите.";
  }
  if (/wholesalebuyerid|оптовик/i.test(withoutUrl)) {
    return "Выберите оптовика из списка.";
  }
  if (/insufficient|не больше|остаток|в машине/i.test(withoutUrl)) {
    return withoutUrl;
  }
  if (/http 401|unauthorized|сессия/i.test(lower)) {
    return "Сессия истекла — войдите снова.";
  }
  if (/http 403|forbidden|недостаточно прав/i.test(lower)) {
    return "Недостаточно прав для этого действия.";
  }
  if (/http 503|postgresql|база данных/i.test(lower)) {
    return "Сервер временно недоступен. Сообщите администратору.";
  }
  if (/http 5\d{2}/.test(lower)) {
    return "Сервер временно не отвечает. Подождите и повторите.";
  }
  if (/loading_manifests_manifest_number_unique|duplicate key.*manifest_number/i.test(lower)) {
    return "Накладная с таким номером уже сохранена. Выберите другой рейс или дату и сохраните снова.";
  }

  return withoutUrl;
}
