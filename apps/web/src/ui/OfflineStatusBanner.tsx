import { useNavigatorOnLine } from "../hooks/useNavigatorOnLine.js";

/**
 * Плашка при отсутствии сети: объясняет, что списки могут быть из локального кэша.
 */
export function OfflineStatusBanner() {
  const online = useNavigatorOnLine();
  if (online) {
    return null;
  }
  return (
    <div
      className="birzha-offline-banner"
      role="status"
      aria-live="polite"
      style={{
        margin: "0 0 0.75rem",
        padding: "0.55rem 0.75rem",
        borderRadius: "var(--birzha-radius-sm)",
        border: "1px solid var(--color-border)",
        background: "var(--birzha-surface-muted)",
        fontSize: "0.92rem",
        lineHeight: 1.45,
      }}
    >
      <strong>Нет сети.</strong> Показаны сохранённые на устройстве данные (рейсы, отчёты, справочники). Действия,
      требующие сервер (в том числе продажи), выполняются только при восстановлении связи.
    </div>
  );
}
