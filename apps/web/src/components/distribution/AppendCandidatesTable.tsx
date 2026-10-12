import { useMemo } from "react";

import type { BatchListItem } from "../../api/types.js";
import {
  aggregateBatchesByDocumentCaliberLine,
  buildAppendItemsFromInputs,
} from "../../format/loading-manifest.js";
import { fieldStyle } from "../../ui/styles.js";

type Props = {
  batches: readonly BatchListItem[];
  warehouseName: string;
  labelDest?: Record<string, string>;
  kgInput: Record<string, string>;
  pkgInput: Record<string, string>;
  onKgChange: (rowKey: string, value: string) => void;
  onPkgChange: (rowKey: string, value: string) => void;
};

export type AppendCandidateLine = { batchId: string; kg: number };

/** Собирает строки догрузки по вводу кг/ящ. (пусто = весь остаток; 0 = пропуск). */
export function resolveAppendCandidateLines(
  batches: readonly BatchListItem[],
  labelDest: Record<string, string> | undefined,
  kgInput: Record<string, string>,
  pkgInput: Record<string, string>,
): AppendCandidateLine[] | null {
  const rows = aggregateBatchesByDocumentCaliberLine(batches, "loading", labelDest).filter((r) => r.totalKg > 0);
  const merged = new Map<string, number>();
  for (const row of rows) {
    const items = buildAppendItemsFromInputs(
      row.batches,
      row,
      kgInput[row.rowKey] ?? "",
      pkgInput[row.rowKey] ?? "",
    );
    if (items == null) {
      return null;
    }
    for (const item of items) {
      merged.set(item.batchId, (merged.get(item.batchId) ?? 0) + item.kg);
    }
  }
  return [...merged.entries()].map(([batchId, kg]) => ({ batchId, kg }));
}

/** Догрузка: что уйдёт в ПН — с вводом кг/ящ. как у возврата сверху. */
export function AppendCandidatesTable({
  batches,
  warehouseName,
  labelDest,
  kgInput,
  pkgInput,
  onKgChange,
  onPkgChange,
}: Props) {
  const rows = useMemo(
    () => aggregateBatchesByDocumentCaliberLine(batches, "loading", labelDest).filter((r) => r.totalKg > 0),
    [batches, labelDest],
  );
  const showsPackages = rows.some((r) => r.linesWithPkg > 0 && r.totalPkg > 0);

  return (
    <section className="no-print" aria-labelledby="append-candidates-h" style={{ margin: "0.85rem 0 0.5rem" }}>
      <h4 id="append-candidates-h" style={{ fontSize: "0.95rem", margin: "0 0 0.4rem" }}>
        Со склада «{warehouseName}» — свободный остаток
      </h4>
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }}>
        Здесь товар на складе (в т.ч. то, что вернули из погрузочной). Введите кг или ящики — сколько догрузить. Пусто =
        весь остаток строки; «0» = не брать.
      </p>
      {rows.length === 0 ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }} role="status">
          На этом складе нет свободных партий этого товара для догрузки.
        </p>
      ) : (
        <div className="birzha-table-scroll birzha-nakl-lines-card">
          <table className="birzha-data-table birzha-data-table--compact" style={{ minWidth: 560 }}>
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
                <th scope="col">Догрузить, кг</th>
                {showsPackages ? <th scope="col">Догрузить, ящ.</th> : null}
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
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="всё"
                      value={kgInput[r.rowKey] ?? ""}
                      onChange={(ev) => onKgChange(r.rowKey, ev.target.value)}
                      aria-label={`Догрузить кг, ${r.documentDisplayLabel} · ${r.lineLabel}`}
                      style={{ ...fieldStyle, width: "5rem" }}
                    />
                  </td>
                  {showsPackages ? (
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="ящ."
                        value={pkgInput[r.rowKey] ?? ""}
                        onChange={(ev) => onPkgChange(r.rowKey, ev.target.value)}
                        aria-label={`Догрузить ящики, ${r.documentDisplayLabel} · ${r.lineLabel}`}
                        style={{ ...fieldStyle, width: "4.5rem" }}
                        disabled={r.linesWithPkg <= 0 || r.totalPkg <= 0}
                      />
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
