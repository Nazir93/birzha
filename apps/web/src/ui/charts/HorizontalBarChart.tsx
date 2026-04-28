import { muted } from "../styles.js";

export type HorizontalBarItem = {
  label: string;
  value: number;
  /** Подпись справа (например «12 345 ₽»). */
  display?: string;
};

type Props = {
  title?: string;
  items: HorizontalBarItem[];
  /** Что показать, если нет положительных значений. */
  emptyHint?: string;
  /** Подпись для screen readers / title полосы. */
  valueSuffix?: string;
};

/**
 * Горизонтальные столбики без тяжёлых зависимостей (масштаб по max среди строк).
 */
export function HorizontalBarChart({ title, items, emptyHint, valueSuffix }: Props) {
  const positive = items.filter((i) => i.value > 0);
  const max = Math.max(...positive.map((i) => i.value), 1);

  if (positive.length === 0) {
    return (
      <div className="birzha-chart-card-inner" role="region" aria-label={title}>
        {title ? <h4 className="birzha-chart-card-inner__title">{title}</h4> : null}
        <p style={{ ...muted, margin: 0, fontSize: "0.88rem" }}>{emptyHint ?? "Нет данных для диаграммы."}</p>
      </div>
    );
  }

  return (
    <div className="birzha-chart-card-inner" role="img" aria-label={title ?? "Горизонтальная диаграмма"}>
      {title ? <h4 className="birzha-chart-card-inner__title">{title}</h4> : null}
      <ul className="birzha-hbar-list">
        {positive.map((it) => {
          const pct = Math.round((it.value / max) * 100);
          const label =
            it.display ??
            (valueSuffix ? `${it.value.toLocaleString("ru-RU")} ${valueSuffix}` : it.value.toLocaleString("ru-RU"));
          return (
            <li key={it.label} className="birzha-hbar-list__item">
              <span className="birzha-hbar-list__label" title={it.label}>
                {it.label}
              </span>
              <div className="birzha-hbar-list__track" title={`${it.label}: ${label}`}>
                <div className="birzha-hbar-list__fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="birzha-hbar-list__value">{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
