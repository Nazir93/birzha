import { useAuth } from "../auth/auth-context.js";

/** Предупреждение при старте без сети с кэшем последнего `GET /api/meta`. */
export function StaleMetaBanner() {
  const { ready, usingStaleMeta } = useAuth();
  if (!ready || !usingStaleMeta) {
    return null;
  }
  return (
    <div
      role="status"
      className="birzha-callout-warning no-print"
      style={{
        margin: "0 0 0.75rem",
        padding: "0.55rem 0.75rem",
        borderRadius: 8,
        fontSize: "0.88rem",
        lineHeight: 1.45,
      }}
    >
      Нет связи с сервером. Показаны сохранённые настройки с последнего удачного запроса — для входа, обновления данных и
      продаж нужна сеть.
    </div>
  );
}
