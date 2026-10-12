import { useMemo } from "react";

import type { BatchListItem } from "../../api/types.js";
import { aggregateBatchesByDocumentCaliberLine } from "../../format/loading-manifest.js";

type Props = {
  batches: readonly BatchListItem[];
  warehouseName: string;
  labelDest?: Record<string, string>;
};

/** Догрузка: что именно со склада уйдёт в ПН по кнопке «Добавить в погрузочную». */
export function AppendCandidatesTable({ batches, warehouseName, labelDest }: Props) {
  const rows = useMemo(
    () => aggregateBatchesByDocumentCaliberLine(batches, "loading", labelDest).filter((r) => r.totalKg > 0),
    [batches, labelDest],
  );
  const showsPackages = rows.some((r) => r.linesWithPkg > 0 && r.totalPkg > 0);

  return (
    <section className="no-print" aria-labelledby="append-candidates-h" style={{ margin: "0.85rem 0 0.5rem" }}>
      <h4 id="append-candidates-h" style={{ fontSize: "0.95rem", margin: "0 0 0.4rem" }}>
        Будет добавлено со склада: {warehouseName}
      </h4>
      {rows.length === 0 ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }} role="status">
          На этом складе нет свободных партий этого товара для догрузки.
        </p>
      ) : (
        <div className="birzha-table-scroll birzha-nakl-lines-card">
          <table className="birzha-data-table birzha-data-table--compact" style={{ minWidth: 480 }}>
            <thead>
              <tr>
                <th scope="col">Накладная</th>
                <th scope="col">Калибр</th>
                <th scope="col" className="birzha-data-table__num">
                  На складе, кг
                </th>
                {showsPackages ? (
                  <th scope="col" className="birzha-data-table__num">
                    Ящ.
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rowKey}>
                  <td>{r.documentDisplayLabel}</td>
                  <td>{r.lineLabel}</td>
                  <td className="birzha-data-table__num">
                    {r.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                  </td>
                  {showsPackages ? (
                    <td className="birzha-data-table__num">
                      {r.linesWithPkg > 0 ? r.totalPkg.toLocaleString("ru-RU") : "—"}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
