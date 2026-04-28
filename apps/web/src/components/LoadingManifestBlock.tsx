import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";

import type { BatchListItem } from "../api/types.js";
import { formatNakladLineLabel, formatShortBatchId } from "../format/batch-label.js";
import {
  aggregateBatchesByCaliberLine,
  estimatedPackageCountOnShelf,
  filterBatchesForLoadingManifest,
  sumLoadingManifestTotals,
} from "../format/loading-manifest.js";
import { purchaseNakladnayaDocumentPath } from "../routes.js";
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
}: Props) {
  const includedBatches = useMemo(
    () => filterBatchesForLoadingManifest(batchesInWh, documentOptions.length, selectedDocIds),
    [batchesInWh, documentOptions.length, selectedDocIds],
  );

  const totals = useMemo(() => sumLoadingManifestTotals(includedBatches), [includedBatches]);

  const byCaliber = useMemo(
    () => aggregateBatchesByCaliberLine(includedBatches),
    [includedBatches],
  );

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

  const buildCsv = useCallback(() => {
    const rows: string[] = [];
    rows.push("===По_калибру===");
    rows.push(["Калибр;Кг;Ящ_оценка"].join(";"));
    for (const r of byCaliber) {
      const ya =
        r.linesWithPkg > 0 ? r.totalPkg.toString() : "";
      rows.push([r.lineLabel.replace(/;/g, " "), r.totalKg.toString(), ya].join(";"));
    }
    if (byCaliber.length > 0) {
      const sumK = byCaliber.reduce((a, c) => a + c.totalKg, 0);
      const hasPkg = byCaliber.some((c) => c.linesWithPkg > 0);
      const sumP = byCaliber.reduce((a, c) => a + c.totalPkg, 0);
      rows.push(
        `Итого;${sumK};${hasPkg ? sumP : ""}`,
      );
    }
    rows.push("");
    rows.push("===По_строкам_партий===");
    const head = ["Номер_накл", "ID_накл", "ID_парт", "Кг_ост", "Ящ_оцен", "Калибр"];
    rows.push(head.join(";"));
    for (const b of includedBatches) {
      const docN = b.nakladnaya?.documentNumber?.replace(/;/g, " ") ?? "";
      const docId = b.nakladnaya?.documentId ?? "";
      const pkgE = estimatedPackageCountOnShelf(b);
      const line = formatNakladLineLabel(b).replace(/;/g, " ");
      rows.push(
        [docN, docId, formatShortBatchId(b.id), String(b.onWarehouseKg), pkgE == null ? "" : String(pkgE), line].join(
          ";",
        ),
      );
    }
    rows.push("");
    rows.push(
      `Свод_кг;${totals.kg};Свод_ящ;${totals.pkg};парт;${includedBatches.length}`,
    );
    return "\uFEFF" + rows.join("\n");
  }, [byCaliber, includedBatches, totals.kg, totals.pkg]);

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
        Сбор на погрузку: какие накладные в этот отбор
      </h3>
      <p style={{ ...muted, margin: "0 0 0.75rem", lineHeight: 1.5 }}>
        На склад <strong>{warehouseName}</strong> отметьте закупочные накладные, с которых берёте{" "}
        <strong>этот</strong> отбор в рейс; снимите накл., если погрузка только с части поставок. Ниже —{" "}
        <strong>свод по калибру</strong> (кг и ≈ ящ. на остатке), затем строки партий. То, что{" "}
        <strong>не</strong> отмечено и не уедет в рейс, остаётся на складе в учёте партий. Суммы по документу и
        бухгалтерия — в исходных накладных; вес/приём правите в «Операциях» при расхождении.
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
              <Link to={purchaseNakladnayaDocumentPath(d.id)} style={{ fontSize: "0.9rem" }}>
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

      {includedBatches.length === 0 && (
        <p style={muted} role="status">
          {documentOptions.length > 0
            ? "Нет строк: отметьте накладные либо на складе нет остатка (всё в рейсах — смотрите Операции)."
            : "Нет строк с остатком в данных."}
        </p>
      )}

      {byCaliber.length > 0 && (
        <div style={{ marginBottom: "0.9rem" }}>
          <h4
            className="loading-print-subhead"
            style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.4rem" }}
            id="loading-by-caliber"
          >
            По калибру / товарной строке (свод)
          </h4>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle} className="loading-caliber-table" aria-labelledby="loading-by-caliber">
              <thead>
                <tr>
                  <th scope="col" style={thHead}>
                    Калибр / товар
                  </th>
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    Остаток, кг
                  </th>
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    Парт.
                  </th>
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    Ящ. (оц.)
                  </th>
                </tr>
              </thead>
              <tbody>
                {byCaliber.map((r) => (
                  <tr key={r.lineLabel}>
                    <td style={thtd}>
                      <strong style={{ fontSize: "0.92rem" }}>{r.lineLabel}</strong>
                    </td>
                    <td style={{ ...thtd, textAlign: "right" }}>{r.totalKg.toLocaleString("ru-RU")}</td>
                    <td style={{ ...thtd, textAlign: "right" }}>{r.partCount}</td>
                    <td style={{ ...thtd, textAlign: "right" }}>
                      {r.linesWithPkg > 0 ? `≈ ${r.totalPkg.toLocaleString("ru-RU")}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {includedBatches.length > 0 && (
        <div>
          <h4
            className="loading-print-subhead"
            style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.4rem" }}
            id="loading-by-batch"
          >
            По партиям (калибр — как в накл.)
          </h4>
          <div style={{ overflowX: "auto" }} role="table">
            <table
              style={tableStyle}
              className="loading-manifest-table"
              aria-labelledby="loading-by-batch"
              aria-label="Детализация по партиям"
            >
              <thead>
                <tr>
                  <th scope="col" style={thHead}>
                    Калибр
                  </th>
                  <th scope="col" style={thHead}>
                    ID партии
                  </th>
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    Остаток, кг
                  </th>
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    Ящ. (оц.)
                  </th>
                </tr>
              </thead>
              <tbody>
                {includedBatches.map((b) => {
                  const pkgE = estimatedPackageCountOnShelf(b);
                  return (
                    <tr key={b.id}>
                      <td style={thtd}>
                        <span style={{ fontSize: "0.92rem", fontWeight: 600 }}>{formatNakladLineLabel(b)}</span>
                      </td>
                      <td style={thtd}>
                        <code className="birzha-text-subtle" style={{ fontSize: "0.8rem" }}>
                          {formatShortBatchId(b.id)}
                        </code>
                      </td>
                      <td style={{ ...thtd, textAlign: "right", fontWeight: 600 }}>{b.onWarehouseKg}</td>
                      <td style={{ ...thtd, textAlign: "right" }}>{pkgE == null ? "—" : `≈ ${pkgE}`}</td>
                    </tr>
                  );
                })}
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
