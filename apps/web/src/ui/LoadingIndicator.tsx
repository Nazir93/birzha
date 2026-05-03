import type { CSSProperties } from "react";

const labelStyle = (size: "sm" | "md"): CSSProperties => ({
  fontSize: size === "sm" ? "0.82rem" : "0.9rem",
  color: "var(--color-muted, #71717a)",
  lineHeight: 1.4,
});

/**
 * Анимированный индикатор (спиннер + подпись) для React Query и долгих запросов.
 */
export function LoadingIndicator({
  label = "Загрузка…",
  size = "md",
}: {
  label?: string;
  size?: "sm" | "md";
}) {
  const spClass =
    size === "sm" ? "birzha-loader__spinner birzha-loader__spinner--sm" : "birzha-loader__spinner";
  return (
    <div
      className="birzha-loader"
      role="status"
      aria-live="polite"
      style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
    >
      <span className={spClass} aria-hidden />
      <span style={labelStyle(size)}>{label}</span>
    </div>
  );
}

/** Крупный блок-заставка, пока ещё нет данных. */
export function LoadingBlock({ label, minHeight = 100 }: { label: string; minHeight?: number }) {
  return (
    <div
      className="birzha-loader-block"
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight,
        padding: "1.25rem 1rem",
        margin: "0.5rem 0 1rem",
        border: "1px dashed #d4d4d8",
        borderRadius: 8,
        background: "#fafafa",
      }}
    >
      <LoadingIndicator label={label} size="md" />
    </div>
  );
}

/** Центрированный экран ожидания для загрузки кабинета/сессии. */
export function LoadingScreen({ label }: { label: string }) {
  return (
    <section className="birzha-loader-screen" role="status" aria-live="polite" aria-label={label}>
      <div className="birzha-loader-screen__card">
        <div className="birzha-loader-screen__mark" aria-hidden>
          <span className="birzha-loader-screen__pulse" />
        </div>
        <LoadingIndicator label={label} size="md" />
        <p className="birzha-loader-screen__note">Подготавливаем кабинет и актуальные данные.</p>
      </div>
    </section>
  );
}

/** Мягкое уведомление о фоновом обновлении кэша (есть устаревшие данные, идёт refetch). */
export function StaleDataNotice({ show, label = "Обновление данных…" }: { show: boolean; label?: string }) {
  if (!show) {
    return null;
  }
  return (
    <p style={{ margin: "0.35rem 0" }} className="birzha-loader--stale" role="status" aria-live="polite">
      <LoadingIndicator label={label} size="sm" />
    </p>
  );
}
