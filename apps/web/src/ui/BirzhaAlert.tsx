import type { ReactNode } from "react";

export type BirzhaAlertVariant = "error" | "warning" | "info" | "success";

const TITLES: Record<BirzhaAlertVariant, string> = {
  error: "Ошибка",
  warning: "Проверьте данные",
  info: "Подсказка",
  success: "Готово",
};

const ICONS: Record<BirzhaAlertVariant, string> = {
  error: "!",
  warning: "⚠",
  info: "i",
  success: "✓",
};

export function BirzhaAlert({
  variant = "error",
  title,
  children,
  className = "",
  onDismiss,
  role = "alert",
  live = "polite",
}: {
  variant?: BirzhaAlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
  onDismiss?: () => void;
  role?: "alert" | "status";
  live?: "polite" | "assertive" | "off";
}) {
  const heading = title ?? TITLES[variant];
  return (
    <div
      className={`birzha-alert birzha-alert--${variant}${className ? ` ${className}` : ""}`}
      role={role}
      aria-live={live}
    >
      <span className="birzha-alert__icon" aria-hidden="true">
        {ICONS[variant]}
      </span>
      <div className="birzha-alert__content">
        <p className="birzha-alert__title">{heading}</p>
        <div className="birzha-alert__message">{children}</div>
      </div>
      {onDismiss ? (
        <button type="button" className="birzha-alert__dismiss" onClick={onDismiss} aria-label="Закрыть">
          ×
        </button>
      ) : null}
    </div>
  );
}
