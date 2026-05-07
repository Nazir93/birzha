import type { ReactNode } from "react";

export type BirzhaEmptyStateProps = {
  title: string;
  /** Основной поясняющий текст */
  description?: ReactNode;
  /** Дополнительный блок (ссылки, списки) */
  children?: ReactNode;
  /** Кнопка или ссылка под текстом */
  action?: ReactNode;
  /** Компактный вид без иконки */
  compact?: boolean;
};

/** Единый блок «ничего нет» для списков и отчётов (нейтральная карточка в стиле кабинета). */
export function BirzhaEmptyState({ title, description, children, action, compact = false }: BirzhaEmptyStateProps) {
  return (
    <div
      className={compact ? "birzha-empty-state birzha-empty-state--compact" : "birzha-empty-state"}
      role="status"
    >
      {!compact && (
        <div className="birzha-empty-state__icon" aria-hidden>
          <svg width={40} height={40} viewBox="0 0 24 24" fill="none">
            <path
              d="M9 12h6M9 16h6M9 8h3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M8 4h8l2 4v12a1 1 0 01-1 1H7a1 1 0 01-1-1V8l2-4z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      <h3 className="birzha-empty-state__title">{title}</h3>
      {description != null && description !== false ? (
        <p className="birzha-empty-state__desc">{description}</p>
      ) : null}
      {children}
      {action != null && action !== false ? <div className="birzha-empty-state__action">{action}</div> : null}
    </div>
  );
}
