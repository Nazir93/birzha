type Props = {
  /** Кг на складах (сумма по партиям). */
  warehouseKg: number;
  /** Кг в пути. */
  transitKg: number;
  /** Кг продано. */
  soldKg: number;
};

function pct(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((part / total) * 1000) / 10;
}

/**
 * Одна полоса «склад / в пути / продано» с легендой (CSS, без chart-библиотек).
 */
export function MassBalanceStrip({ warehouseKg, transitKg, soldKg }: Props) {
  const total = warehouseKg + transitKg + soldKg;
  if (total <= 0) {
    return (
      <p className="birzha-chart-empty" style={{ margin: 0 }}>
        Нет учтённой массы по партиям (все нули).
      </p>
    );
  }

  const pWh = pct(warehouseKg, total);
  const pTr = pct(transitKg, total);
  const pSold = pct(soldKg, total);

  return (
    <div className="birzha-mass-strip" role="img" aria-label="Распределение массы по партиям: склад, в пути, продано">
      <div className="birzha-mass-strip__bar">
        {warehouseKg > 0 ? (
          <div
            className="birzha-mass-strip__seg birzha-mass-strip__seg--wh"
            style={{ flex: `${warehouseKg}` }}
            title={`На складах: ${warehouseKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг (${pWh}%)`}
          />
        ) : null}
        {transitKg > 0 ? (
          <div
            className="birzha-mass-strip__seg birzha-mass-strip__seg--tr"
            style={{ flex: `${transitKg}` }}
            title={`В пути: ${transitKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг (${pTr}%)`}
          />
        ) : null}
        {soldKg > 0 ? (
          <div
            className="birzha-mass-strip__seg birzha-mass-strip__seg--sold"
            style={{ flex: `${soldKg}` }}
            title={`Продано: ${soldKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг (${pSold}%)`}
          />
        ) : null}
      </div>
      <ul className="birzha-mass-strip__legend">
        <li>
          <span className="birzha-mass-strip__dot birzha-mass-strip__dot--wh" /> На складах:{" "}
          <strong>{warehouseKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</strong> кг ({pWh}%)
        </li>
        <li>
          <span className="birzha-mass-strip__dot birzha-mass-strip__dot--tr" /> В пути:{" "}
          <strong>{transitKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</strong> кг ({pTr}%)
        </li>
        <li>
          <span className="birzha-mass-strip__dot birzha-mass-strip__dot--sold" /> Продано:{" "}
          <strong>{soldKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</strong> кг ({pSold}%)
        </li>
      </ul>
    </div>
  );
}
