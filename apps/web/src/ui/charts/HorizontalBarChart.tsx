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

const barPalette = [
  "linear-gradient(90deg, #2563eb 0%, #60a5fa 100%)",
  "linear-gradient(90deg, #16a34a 0%, #4ade80 100%)",
  "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)",
  "linear-gradient(90deg, #7c3aed 0%, #a78bfa 100%)",
  "linear-gradient(90deg, #0891b2 0%, #22d3ee 100%)",
  "linear-gradient(90deg, #e11d48 0%, #fb7185 100%)",
];

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
        {positive.map((it, index) => {
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
                <div
                  className="birzha-hbar-list__fill"
                  style={{ width: `${pct}%`, background: barPalette[index % barPalette.length] }}
                />
              </div>
              <span className="birzha-hbar-list__value">{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
