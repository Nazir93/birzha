import { useCallback, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";

import type { BatchListItem } from "../api/types.js";
import type { LoadingManifestDetail } from "../api/types.js";
import {
  aggregateBatchesByCaliberLine,
  filterBatchesForLoadingManifest,
  sumLoadingManifestTotals,
} from "../format/loading-manifest.js";
import { purchaseNakladnayaDocumentPathForPath } from "../routes.js";
import { btnStyle, btnStyleInline, muted, tableStyle, thHead, thtd } from "../ui/styles.js";

export type LoadingManifestDocOption = { id: string; checkboxLabel: string };

type Props = {
  documentOptions: LoadingManifestDocOption[];
  /** Выбор вынесен в AllocationPanel, чтобы тот же фильтр применялся к «Шаг 3: строки». */
  selectedDocIds: ReadonlySet<string>;
  onToggleNaklDoc: (id: string) => void;
  onSelectAllNakl: () => void;
  onClearNakl: () => void;
  batchesInWh: BatchListItem[];
  warehouseName: string;
  manifest?: LoadingManifestDetail | null;
};

/**
 * Свод на погрузку: мультинакл., **свод по калибру**, детализация по партиям без дублирования ссылок; печать/CSV.
 * Бухучёт: в исходных накладных; **остаток/факт** в партиях/Операциях.
 */
export function LoadingManifestBlock({
  documentOptions,
  selectedDocIds,
  onToggleNaklDoc,
  onSelectAllNakl,
  onClearNakl,
  batchesInWh,
  warehouseName,
  manifest = null,
}: Props) {
  const { pathname } = useLocation();
  const includedBatchesFromSelection = useMemo(
    () => filterBatchesForLoadingManifest(batchesInWh, documentOptions.length, selectedDocIds),
    [batchesInWh, documentOptions.length, selectedDocIds],
  );
  const includedBatches = useMemo(() => {
    if (!manifest) {
      return includedBatchesFromSelection;
    }
    const byId = new Map(batchesInWh.map((b) => [b.id, b]));
    return manifest.lines.map((line) => byId.get(line.batchId)).filter((b): b is BatchListItem => Boolean(b));
  }, [batchesInWh, includedBatchesFromSelection, manifest]);

  const totals = useMemo(() => sumLoadingManifestTotals(includedBatches), [includedBatches]);
  const caliberRows = useMemo(() => aggregateBatchesByCaliberLine(includedBatches), [includedBatches]);

  const uniqueDocuments = useMemo(() => {
    const m = new Map<string, { id: string; number: string }>();
    for (const b of includedBatches) {
      const id = b.nakladnaya?.documentId;
      if (!id) {
        continue;
      }
      m.set(id, { id, number: b.nakladnaya?.documentNumber?.trim() || id });
    }
    return [...m.values()].sort((a, b) => a.number.localeCompare(b.number, "ru"));
  }, [includedBatches]);

  const caliberCaption = useMemo(() => {
    return caliberRows
      .map((row) => row.lineLabel)
      .filter((x) => x !== "—")
      .join(", ");
  }, [caliberRows]);

  const buildCsv = useCallback(() => {
    const rows: string[] = [];
    rows.push("===Свод_по_калибрам===");
    const head = ["Калибр", "Кг_ост", "Ящ_оцен", "Парт"];
    rows.push(head.join(";"));
    for (const row of caliberRows) {
      rows.push(
        [
          row.lineLabel.replace(/;/g, " "),
          String(row.totalKg),
          row.linesWithPkg === 0 ? "" : String(row.totalPkg),
          String(row.partCount),
        ].join(";"),
      );
    }
    rows.push("");
    rows.push(
      `Свод_кг;${totals.kg};Свод_ящ;${totals.pkg};парт;${includedBatches.length}`,
    );
    return "\uFEFF" + rows.join("\n");
  }, [caliberRows, includedBatches.length, totals.kg, totals.pkg]);

  const downloadCsv = useCallback(() => {
    const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pogruzka-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildCsv]);

  return (
    <section className="loading-manifest-print birzha-loading-manifest" aria-labelledby="loading-manifest-h">
      <h3 id="loading-manifest-h" style={{ fontSize: "1rem", margin: "0 0 0.4rem" }}>
        Погрузочная накладная
      </h3>
      {manifest ? (
        <p style={{ margin: "0 0 0.55rem", fontSize: "0.92rem" }}>
          <strong>№ {manifest.manifestNumber}</strong> от {manifest.docDate} · {manifest.destinationName} ·{" "}
          {manifest.warehouseName} ({manifest.warehouseCode})
        </p>
      ) : null}
      <p style={{ ...muted, margin: "0 0 0.75rem", lineHeight: 1.5 }}>
        Склад: <strong>{manifest?.warehouseName ?? warehouseName}</strong>.
      </p>
      {documentOptions.length > 0 && (
        <div className="no-print" style={{ marginBottom: "0.75rem" }}>
          <p style={{ ...muted, fontSize: "0.86rem", margin: "0 0 0.4rem" }}>Включить в отбор (один раз на документ)</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem 0.75rem", alignItems: "center" }}>
            {documentOptions.map((d) => (
              <label
                key={d.id}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.9rem", cursor: "pointer" }}
              >
                <input type="checkbox" checked={selectedDocIds.has(d.id)} onChange={() => onToggleNaklDoc(d.id)} />
                {d.checkboxLabel}
              </label>
            ))}
            <button type="button" style={btnStyleInline} onClick={onSelectAllNakl}>
              Все
            </button>
            <button type="button" style={btnStyleInline} onClick={onClearNakl}>
              Снять
            </button>
          </div>
        </div>
      )}

      {uniqueDocuments.length > 0 && (
        <p className="no-print" style={{ fontSize: "0.86rem", margin: "0 0 0.5rem" }}>
          <span style={muted}>Карточки накладных: </span>
          {uniqueDocuments.map((d) => (
            <span key={d.id} style={{ marginRight: 10 }}>
              <Link to={purchaseNakladnayaDocumentPathForPath(pathname, d.id)} style={{ fontSize: "0.9rem" }}>
                № {d.number} · {d.id.slice(0, 6)}…
              </Link>
            </span>
          ))}
        </p>
      )}

      <p style={{ margin: "0 0 0.4rem", fontSize: "0.92rem" }} role="status" aria-live="polite">
        <strong>Итого по отбору:</strong> {totals.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг,{" "}
        {totals.batchCount} парт.
        {totals.linesWithPkg > 0 ? (
          <> · ящ. ≈ {totals.pkg.toLocaleString("ru-RU")} (оценка с накл.)</>
        ) : null}
      </p>
      {caliberCaption ? (
        <p style={{ ...muted, marginTop: 0, marginBottom: "0.45rem", fontSize: "0.86rem" }}>
          <strong>Калибры в накладной:</strong> {caliberCaption}
        </p>
      ) : null}

      {includedBatches.length === 0 && (
        <p style={muted} role="status">
          {documentOptions.length > 0
            ? "Нет строк: отметьте накладные либо на складе нет остатка (всё в рейсах — смотрите Операции)."
            : "Нет строк с остатком в данных."}
        </p>
      )}

      {caliberRows.length > 0 && (
        <div>
          <h4
            className="loading-print-subhead"
            style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.4rem" }}
            id="loading-by-batch"
          >
            По калибрам
          </h4>
          <div style={{ overflowX: "auto" }} role="table">
            <table
              style={tableStyle}
              className="loading-manifest-table"
              aria-labelledby="loading-by-batch"
              aria-label="Свод по калибрам"
            >
              <thead>
                <tr>
                  <th scope="col" style={thHead}>
                    Калибр (как в накладной)
                  </th>
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    Остаток, кг
                  </th>
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    Ящ. (оц.)
                  </th>
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    Парт.
                  </th>
                </tr>
              </thead>
              <tbody>
                {caliberRows.map((row) => (
                  <tr key={row.lineLabel}>
                    <td style={thtd}>
                      <span style={{ fontSize: "0.92rem", fontWeight: 600 }}>{row.lineLabel}</span>
                    </td>
                    <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>
                      {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...thtd, textAlign: "right" }}>
                      {row.linesWithPkg === 0 ? "—" : `≈ ${row.totalPkg}`}
                    </td>
                    <td style={{ ...thtd, textAlign: "right" }}>{row.partCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {includedBatches.length > 0 && (
        <p className="no-print" style={{ margin: "0.6rem 0 0" }}>
          <button type="button" style={btnStyle} onClick={() => window.print()}>
            Печать листа
          </button>{" "}
          <button type="button" style={btnStyle} onClick={downloadCsv}>
            Скачать CSV
          </button>
        </p>
      )}
    </section>
  );
}
