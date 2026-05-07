import type { CSSProperties } from "react";

/** Одна строка-пульсация для скелетонов загрузки. */
export function BirzhaSkeletonLine({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`birzha-skeleton-line ${className}`.trim()}
      style={style}
      aria-hidden
    />
  );
}

/**
 * Несколько строк скелетона + опциональная подпись для замены голого «Загрузка…» в панелях.
 */
export function BirzhaSkeletonPanel({
  label,
  rows = 5,
  minHeight = 96,
}: {
  label?: string;
  rows?: number;
  minHeight?: number;
}) {
  return (
    <div
      className="birzha-skeleton-panel"
      role="status"
      aria-live="polite"
      aria-label={label ?? "Загрузка данных"}
      style={{ minHeight }}
    >
      <div className="birzha-skeleton-panel__lines">
        {Array.from({ length: rows }, (_, i) => (
          <BirzhaSkeletonLine
            key={i}
            style={{
              width: i === rows - 1 ? "72%" : "100%",
            }}
          />
        ))}
      </div>
      {label ? <p className="birzha-skeleton-panel__label">{label}</p> : null}
    </div>
  );
}
