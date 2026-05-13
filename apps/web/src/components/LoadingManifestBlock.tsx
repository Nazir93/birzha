import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import type { BatchListItem } from "../api/types.js";
import type { LoadingManifestDetail } from "../api/types.js";
import {
  aggregateBatchesByCaliberLine,
  aggregateBatchesByPurchaseDocument,
  filterBatchesForLoadingManifest,
  sumLoadingManifestTotals,
} from "../format/loading-manifest.js";
import { purchaseNakladnayaDocumentPathForPath } from "../routes.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { btnStyle, btnStyleInline, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

export type LoadingManifestDocOption = { id: string; checkboxLabel: string };

export type LoadingManifestWriteOffProps = {
  enabled: boolean;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string | null;
  rejectInput: Record<string, string>;
  onRejectInputChange: (key: string, value: string) => void;
  onSubmitWriteOff: (inputKey: string, items: { batchId: string; kg: number }[]) => void;
};

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
  writeOff?: LoadingManifestWriteOffProps | null;
};

function writeOffKeyCaliber(lineLabel: string): string {
  return `wo-cal:${lineLabel}`;
}

function writeOffKeyDocument(rowKey: string): string {
  return `wo-doc:${rowKey}`;
}

/**
 * Свод на погрузку: мультинакл., таблица остатка по калибру или по накладной (с итого), списание брака тем же переключателем; печать/CSV.
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
  writeOff = null,
}: Props) {
  const { pathname } = useLocation();
  const [stockTableMode, setStockTableMode] = useState<"caliber" | "nakladnaya">("caliber");
  const [writeOffGroupMode, setWriteOffGroupMode] = useState<"caliber" | "nakladnaya">("caliber");

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
  const documentRows = useMemo(() => aggregateBatchesByPurchaseDocument(includedBatches), [includedBatches]);

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
    if (stockTableMode === "caliber") {
      rows.push("===Свод_по_калибрам===");
      rows.push(["Калибр", "Кг_ост", "Ящ_оцен", "Парт"].join(";"));
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
    } else {
      rows.push("===Свод_по_накладным===");
      rows.push(["Накладная", "Кг_ост", "Ящ_оцен", "Парт"].join(";"));
      for (const row of documentRows) {
        rows.push(
          [
            row.displayLabel.replace(/;/g, " "),
            String(row.totalKg),
            row.linesWithPkg === 0 ? "" : String(row.totalPkg),
            String(row.partCount),
          ].join(";"),
        );
      }
    }
    rows.push("");
    rows.push(`Свод_кг;${totals.kg};Свод_ящ;${totals.pkg};парт;${includedBatches.length}`);
    return "\uFEFF" + rows.join("\n");
  }, [caliberRows, documentRows, includedBatches.length, stockTableMode, totals.kg, totals.pkg]);

  const downloadCsv = useCallback(() => {
    const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pogruzka-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildCsv]);

  const stockTableLabelId = "loading-manifest-stock-table";
  const modeToggleId = "loading-manifest-mode";

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
      <p className="birzha-callout-info" style={{ margin: "0 0 0.75rem", lineHeight: 1.5 }}>
        Склад: <strong>{manifest?.warehouseName ?? warehouseName}</strong>.
      </p>
      {documentOptions.length > 0 && (
        <div className="no-print" style={{ marginBottom: "0.75rem" }}>
          <p className="birzha-callout-info" style={{ fontSize: "0.86rem", margin: "0 0 0.4rem" }}>
            Включить в отбор (один раз на документ)
          </p>
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
          <span className="birzha-text-muted">Карточки накладных: </span>
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

      {includedBatches.length === 0 && (
        <BirzhaEmptyState
          compact
          title="Нет строк в отборе"
          description={
            documentOptions.length > 0
              ? "Отметьте накладные либо на складе нет остатка (всё в рейсах — смотрите Операции)."
              : "Нет строк с остатком в данных."
          }
        />
      )}

      {includedBatches.length > 0 && (
        <div style={{ marginTop: "0.35rem" }}>
          <h4
            className="loading-print-subhead"
            style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.35rem" }}
            id={stockTableLabelId}
          >
            Остаток на складе в отборе и списание (брак)
          </h4>
          <div
            className="no-print"
            id={modeToggleId}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.65rem 1.25rem",
              alignItems: "baseline",
              marginBottom: "0.45rem",
              fontSize: "0.86rem",
            }}
          >
            <span className="birzha-text-muted">Таблица:</span>
            <label style={{ cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="lm-stock-mode"
                checked={stockTableMode === "caliber"}
                onChange={() => setStockTableMode("caliber")}
              />
              по калибрам
            </label>
            <label style={{ cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="lm-stock-mode"
                checked={stockTableMode === "nakladnaya"}
                onChange={() => setStockTableMode("nakladnaya")}
              />
              по накладным
            </label>
            {writeOff?.enabled ? (
              <>
                <span style={{ opacity: 0.35 }} aria-hidden>
                  |
                </span>
                <span className="birzha-text-muted">Списать строками:</span>
                <label style={{ cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="lm-writeoff-mode"
                    checked={writeOffGroupMode === "caliber"}
                    onChange={() => setWriteOffGroupMode("caliber")}
                  />
                  по калибрам
                </label>
                <label style={{ cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="lm-writeoff-mode"
                    checked={writeOffGroupMode === "nakladnaya"}
                    onChange={() => setWriteOffGroupMode("nakladnaya")}
                  />
                  по накладным
                </label>
              </>
            ) : null}
          </div>

          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table
              style={tableStyle}
              className="loading-manifest-table"
              aria-labelledby={stockTableLabelId}
              aria-describedby={modeToggleId}
              aria-label={stockTableMode === "caliber" ? "Остаток по калибрам" : "Остаток по накладным"}
            >
              <thead>
                <tr>
                  {stockTableMode === "caliber" ? (
                    <th scope="col" style={thHead}>
                      Калибр (как в накладной)
                    </th>
                  ) : (
                    <th scope="col" style={thHead}>
                      Накладная
                    </th>
                  )}
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    На складе, кг
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
                {stockTableMode === "caliber"
                  ? caliberRows.map((row) => (
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
                    ))
                  : documentRows.map((row) => (
                      <tr key={row.rowKey}>
                        <td style={thtd}>
                          {row.documentId ? (
                            <Link
                              to={purchaseNakladnayaDocumentPathForPath(pathname, row.documentId)}
                              style={{ fontSize: "0.92rem", fontWeight: 600 }}
                            >
                              {row.displayLabel}
                            </Link>
                          ) : (
                            <span style={{ fontSize: "0.92rem", fontWeight: 600 }}>{row.displayLabel}</span>
                          )}
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
              <tfoot>
                <tr>
                  <th scope="row" style={{ ...thtd, fontWeight: 700, textAlign: "left" }}>
                    Итого
                  </th>
                  <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>
                    {totals.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>
                    {totals.linesWithPkg === 0 ? "—" : `≈ ${totals.pkg.toLocaleString("ru-RU")}`}
                  </td>
                  <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>{totals.batchCount}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {writeOff?.enabled ? (
            <div style={{ marginTop: "0.75rem" }} className="no-print">
              <h5 style={{ fontSize: "0.88rem", fontWeight: 600, margin: "0 0 0.35rem" }}>Списать со склада (брак)</h5>
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                <table style={{ ...tableStyle, minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th style={thHead}>{writeOffGroupMode === "caliber" ? "Калибр / строка" : "Накладная"}</th>
                      <th style={thHead}>Остаток, кг</th>
                      <th style={thHead}>Списать, кг</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writeOffGroupMode === "caliber"
                      ? caliberRows.map((row) => {
                          const inputKey = writeOffKeyCaliber(row.lineLabel);
                          return (
                            <tr key={`wo-cal-${row.lineLabel}`}>
                              <td style={thtd}>
                                <strong>{row.lineLabel}</strong>
                                <span className="birzha-text-muted birzha-text-muted--xs" style={{ marginLeft: 6 }}>
                                  {row.partCount} парт.
                                </span>
                              </td>
                              <td style={thtd}>
                                {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                              </td>
                              <td style={thtd}>
                                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="кг"
                                    value={writeOff.rejectInput[inputKey] ?? ""}
                                    onChange={(ev) => writeOff.onRejectInputChange(inputKey, ev.target.value)}
                                    aria-label={`Списать кг, ${row.lineLabel}`}
                                    style={{ ...fieldStyle, width: "5rem" }}
                                  />
                                  <button
                                    type="button"
                                    style={btnStyle}
                                    disabled={writeOff.isPending}
                                    onClick={() => {
                                      const s = (writeOff.rejectInput[inputKey] ?? "").replace(",", ".");
                                      const kg = parseFloat(s);
                                      if (!Number.isFinite(kg) || kg <= 0 || kg > row.totalKg) {
                                        return;
                                      }
                                      let remaining = kg;
                                      const items: { batchId: string; kg: number }[] = [];
                                      for (const batch of row.batches) {
                                        if (remaining <= 0) {
                                          break;
                                        }
                                        const kgFromBatch = Math.min(remaining, batch.onWarehouseKg);
                                        if (kgFromBatch > 0) {
                                          items.push({ batchId: batch.id, kg: kgFromBatch });
                                          remaining -= kgFromBatch;
                                        }
                                      }
                                      if (items.length > 0) {
                                        writeOff.onSubmitWriteOff(inputKey, items);
                                      }
                                    }}
                                  >
                                    Списать
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      : documentRows.map((row) => {
                          const inputKey = writeOffKeyDocument(row.rowKey);
                          return (
                            <tr key={`wo-doc-${row.rowKey}`}>
                              <td style={thtd}>
                                {row.documentId ? (
                                  <Link to={purchaseNakladnayaDocumentPathForPath(pathname, row.documentId)} style={{ fontWeight: 600 }}>
                                    {row.displayLabel}
                                  </Link>
                                ) : (
                                  <strong>{row.displayLabel}</strong>
                                )}
                                <span className="birzha-text-muted birzha-text-muted--xs" style={{ marginLeft: 6 }}>
                                  {row.partCount} парт.
                                </span>
                              </td>
                              <td style={thtd}>
                                {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                              </td>
                              <td style={thtd}>
                                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="кг"
                                    value={writeOff.rejectInput[inputKey] ?? ""}
                                    onChange={(ev) => writeOff.onRejectInputChange(inputKey, ev.target.value)}
                                    aria-label={`Списать кг, ${row.displayLabel}`}
                                    style={{ ...fieldStyle, width: "5rem" }}
                                  />
                                  <button
                                    type="button"
                                    style={btnStyle}
                                    disabled={writeOff.isPending}
                                    onClick={() => {
                                      const s = (writeOff.rejectInput[inputKey] ?? "").replace(",", ".");
                                      const kg = parseFloat(s);
                                      if (!Number.isFinite(kg) || kg <= 0 || kg > row.totalKg) {
                                        return;
                                      }
                                      let remaining = kg;
                                      const items: { batchId: string; kg: number }[] = [];
                                      for (const batch of row.batches) {
                                        if (remaining <= 0) {
                                          break;
                                        }
                                        const kgFromBatch = Math.min(remaining, batch.onWarehouseKg);
                                        if (kgFromBatch > 0) {
                                          items.push({ batchId: batch.id, kg: kgFromBatch });
                                          remaining -= kgFromBatch;
                                        }
                                      }
                                      if (items.length > 0) {
                                        writeOff.onSubmitWriteOff(inputKey, items);
                                      }
                                    }}
                                  >
                                    Списать
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" style={{ ...thtd, fontWeight: 700, textAlign: "left" }}>
                        Итого (остаток в строках выше)
                      </th>
                      <td style={{ ...thtd, fontWeight: 700 }}>
                        {writeOffGroupMode === "caliber"
                          ? caliberRows
                              .reduce((a, r) => a + r.totalKg, 0)
                              .toLocaleString("ru-RU", { maximumFractionDigits: 2 })
                          : documentRows
                              .reduce((a, r) => a + r.totalKg, 0)
                              .toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                      </td>
                      <td style={thtd} />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {writeOff.isError && writeOff.errorMessage ? (
                <p role="alert" style={{ marginTop: "0.45rem", color: "#b91c1c", fontSize: "0.88rem" }}>
                  {writeOff.errorMessage}
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="no-print" style={{ margin: "0.6rem 0 0" }}>
            <button type="button" style={btnStyle} onClick={() => window.print()}>
              Печать листа
            </button>{" "}
            <button type="button" style={btnStyle} onClick={downloadCsv}>
              Скачать CSV
            </button>
          </p>
        </div>
      )}
    </section>
  );
}
