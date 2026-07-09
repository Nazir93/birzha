import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import type { BatchListItem } from "../api/types.js";
import type { LoadingManifestDetail } from "../api/types.js";
import {
  aggregateBatchesByCaliberLine,
  aggregateBatchesByDocumentCaliberLine,
  aggregateBatchesByPurchaseDocument,
  buildWriteOffItemsFromBatches,
  buildWriteOffItemsFromInputs,
  filterBatchesForLoadingManifest,
  formatLoadingManifestCardHeader,
  sumLoadingManifestTotals,
} from "../format/loading-manifest.js";
import { purchaseNakladnayaDocumentPathForPath } from "../routes.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { WriteOffRecentList, type RecentWriteOffRow } from "./distribution/WriteOffRecentList.js";
import { btnClassInline, btnClassSpaced, fieldStyle } from "../ui/styles.js";

export type LoadingManifestDocOption = { id: string; checkboxLabel: string };

export type LoadingManifestWriteOffProps = {
  enabled: boolean;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string | null;
  rejectInput: Record<string, string>;
  rejectPkgInput: Record<string, string>;
  onRejectInputChange: (key: string, value: string) => void;
  onRejectPkgInputChange: (key: string, value: string) => void;
  onSubmitWriteOff: (inputKey: string, items: { batchId: string; kg: number }[], label: string) => void;
  recentWriteOffs: RecentWriteOffRow[];
  undoingWriteOffId: string | null;
  undoError: string | null;
  onUndoWriteOff: (writeOffId: string) => void;
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

function writeOffKeyDocumentCaliber(rowKey: string): string {
  return `wo-dc:${rowKey}`;
}

function writeOffKeyDocument(rowKey: string): string {
  return `wo-doc:${rowKey}`;
}

function formatWriteOffPkg(value: number): string {
  return value.toLocaleString("ru-RU");
}

function submitWriteOffRow(
  writeOff: LoadingManifestWriteOffProps,
  inputKey: string,
  row: { totalKg: number; totalPkg: number; linesWithPkg: number },
  batches: BatchListItem[],
  label: string,
): void {
  const items = buildWriteOffItemsFromInputs(
    batches,
    row,
    writeOff.rejectInput[inputKey] ?? "",
    writeOff.rejectPkgInput[inputKey] ?? "",
  );
  if (items && items.length > 0) {
    writeOff.onSubmitWriteOff(inputKey, items, label);
  }
}

/** Если строка ПН есть, а партия не попала в текущий список склада — показать кг из снимка ПН. */
function syntheticBatchFromManifestLine(
  line: LoadingManifestDetail["lines"][number],
): BatchListItem {
  const pkgRaw = line.packageCount != null && line.packageCount !== "" ? Number(line.packageCount) : NaN;
  const linePk = Number.isFinite(pkgRaw) && pkgRaw > 0 ? pkgRaw : null;
  return {
    id: line.batchId,
    purchaseId: "—",
    totalKg: line.kg,
    pricePerKg: 0,
    pendingInboundKg: 0,
    onWarehouseKg: line.kg,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    nakladnaya: {
      documentId: null,
      warehouseId: null,
      productGradeCode: line.productGradeCode,
      productGroup: line.productGroup,
      documentNumber: line.purchaseDocumentNumber,
      linePackageCount: linePk,
    },
  };
}

/**
 * Свод на погрузку: мультинакл., таблица остатка по калибру или по накладной (с итого), списание брака тем же переключателем.
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

  const includedBatchesFromSelection = useMemo(() => {
    const docCount =
      documentOptions.length > 0 && selectedDocIds.size === 0 ? 0 : documentOptions.length;
    return filterBatchesForLoadingManifest(batchesInWh, docCount, selectedDocIds);
  }, [batchesInWh, documentOptions.length, selectedDocIds]);
  const includedBatches = useMemo(() => {
    if (!manifest) {
      return includedBatchesFromSelection;
    }
    const byId = new Map(batchesInWh.map((b) => [b.id, b]));
    return manifest.lines.map((line) => {
      const b = byId.get(line.batchId);
      return b ?? syntheticBatchFromManifestLine(line);
    });
  }, [batchesInWh, includedBatchesFromSelection, manifest]);

  const totals = useMemo(() => sumLoadingManifestTotals(includedBatches), [includedBatches]);
  const caliberRows = useMemo(() => aggregateBatchesByCaliberLine(includedBatches), [includedBatches]);
  const documentCaliberRows = useMemo(
    () => aggregateBatchesByDocumentCaliberLine(includedBatches),
    [includedBatches],
  );
  const documentRows = useMemo(() => aggregateBatchesByPurchaseDocument(includedBatches), [includedBatches]);
  const writeOffShowsPackages = useMemo(
    () =>
      documentCaliberRows.some((r) => r.linesWithPkg > 0 && r.totalPkg > 0) ||
      documentRows.some((r) => r.linesWithPkg > 0 && r.totalPkg > 0),
    [documentCaliberRows, documentRows],
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

  const stockTableLabelId = "loading-manifest-stock-table";
  const modeToggleId = "loading-manifest-mode";

  return (
    <section className="loading-manifest-print birzha-loading-manifest" aria-labelledby="loading-manifest-h">
      <h3 id="loading-manifest-h" style={{ fontSize: "1rem", margin: "0 0 0.4rem" }}>
        {manifest ? "Погрузочная накладная" : "Отбор партий со склада"}
      </h3>
      {manifest ? (
        <p style={{ margin: "0 0 0.55rem", fontSize: "0.92rem" }}>
          {(() => {
            const header = formatLoadingManifestCardHeader({
              manifestNumber: manifest.manifestNumber,
              destinationName: manifest.destinationName,
              docDate: manifest.docDate,
              warehouseLabel: manifest.warehouseName,
            });
            return (
              <>
                <strong>{header.title}</strong>
                {header.meta ? <> · {header.meta}</> : null}
              </>
            );
          })()}
        </p>
      ) : (
        <p className="birzha-callout-info" style={{ margin: "0 0 0.75rem", lineHeight: 1.5 }}>
          Склад: <strong>{warehouseName}</strong>.
        </p>
      )}
      {documentOptions.length > 0 && (
        <div className="no-print birzha-clean-ops-meta-grid birzha-distribution-doc-checkboxes" style={{ marginBottom: "0.75rem" }}>
          <p className="birzha-callout-info" style={{ fontSize: "0.86rem", margin: "0 0 0.4rem", gridColumn: "1 / -1" }}>
            Включить в отбор (один раз на документ)
          </p>
          {documentOptions.map((d) => (
            <label key={d.id} className="birzha-form-label" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={selectedDocIds.has(d.id)} onChange={() => onToggleNaklDoc(d.id)} />
              {d.checkboxLabel}
            </label>
          ))}
          <span style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className={btnClassInline} onClick={onSelectAllNakl}>
              Все
            </button>
            <button type="button" className={btnClassInline} onClick={onClearNakl}>
              Снять
            </button>
          </span>
        </div>
      )}

      {uniqueDocuments.length > 0 && (
        <p className="no-print" style={{ fontSize: "0.86rem", margin: "0 0 0.5rem" }}>
          <span className="birzha-text-muted">Карточки накладных: </span>
          {uniqueDocuments.map((d) => (
            <span key={d.id} style={{ marginRight: 10 }}>
              <Link to={purchaseNakladnayaDocumentPathForPath(pathname, d.id)} style={{ fontSize: "0.9rem" }}>
                № {d.number}
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
          {writeOff?.enabled ? (
            <div style={{ marginBottom: "0.85rem" }} className="no-print">
              <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.35rem" }}>Списание со склада</h4>
              <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }}>
                По калибру: строка «накладная + калибр» — списание только с выбранной накладной. По накладной:
                видны все калибры документа; «Списать всё» — весь остаток по накладной. Можно указать кг или ящики
                (если в накладной задано число ящиков по строке).
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.65rem 1.25rem",
                  alignItems: "baseline",
                  marginBottom: "0.45rem",
                  fontSize: "0.86rem",
                }}
              >
                <span className="birzha-text-muted">Списать по:</span>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="lm-writeoff-mode"
                    checked={writeOffGroupMode === "caliber"}
                    onChange={() => setWriteOffGroupMode("caliber")}
                  />
                  калибр + накладная
                </label>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="lm-writeoff-mode"
                    checked={writeOffGroupMode === "nakladnaya"}
                    onChange={() => setWriteOffGroupMode("nakladnaya")}
                  />
                  накладная целиком
                </label>
              </div>
              <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-nakl-lines-card">
                <table className="birzha-data-table birzha-data-table--compact" style={{ minWidth: 560 }}>
                  <thead>
                    <tr>
                      {writeOffGroupMode === "caliber" ? (
                        <>
                          <th>Накладная</th>
                          <th>Калибр</th>
                        </>
                      ) : (
                        <>
                          <th>Накладная</th>
                          <th>Калибры в документе</th>
                        </>
                      )}
                      <th className="birzha-data-table__num">Остаток, кг</th>
                      {writeOffShowsPackages ? <th className="birzha-data-table__num">Остаток, ящ.</th> : null}
                      <th>Списать, кг</th>
                      {writeOffShowsPackages ? <th>Списать, ящ.</th> : null}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {writeOffGroupMode === "caliber"
                      ? documentCaliberRows.map((row) => {
                          const inputKey = writeOffKeyDocumentCaliber(row.rowKey);
                          const submitLabel = `${row.documentDisplayLabel} · ${row.lineLabel}`;
                          return (
                            <tr key={`wo-dc-${row.rowKey}`}>
                              <td>
                                {row.documentId ? (
                                  <Link
                                    to={purchaseNakladnayaDocumentPathForPath(pathname, row.documentId)}
                                    style={{ fontWeight: 600 }}
                                  >
                                    {row.documentDisplayLabel}
                                  </Link>
                                ) : (
                                  <strong>{row.documentDisplayLabel}</strong>
                                )}
                              </td>
                              <td>
                                <strong>{row.lineLabel}</strong>
                                <span className="birzha-text-muted birzha-text-muted--xs" style={{ marginLeft: 6 }}>
                                  {row.partCount} парт.
                                </span>
                              </td>
                              <td className="birzha-data-table__num">
                                {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                              </td>
                              {writeOffShowsPackages ? (
                                <td className="birzha-data-table__num">
                                  {row.linesWithPkg > 0 && row.totalPkg > 0
                                    ? formatWriteOffPkg(row.totalPkg)
                                    : "—"}
                                </td>
                              ) : null}
                              <td>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="кг"
                                  value={writeOff.rejectInput[inputKey] ?? ""}
                                  onChange={(ev) => writeOff.onRejectInputChange(inputKey, ev.target.value)}
                                  aria-label={`Списать кг, ${submitLabel}`}
                                  style={{ ...fieldStyle, width: "5rem" }}
                                />
                              </td>
                              {writeOffShowsPackages ? (
                                <td>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="ящ."
                                    value={writeOff.rejectPkgInput[inputKey] ?? ""}
                                    onChange={(ev) => writeOff.onRejectPkgInputChange(inputKey, ev.target.value)}
                                    aria-label={`Списать ящики, ${submitLabel}`}
                                    style={{ ...fieldStyle, width: "4.5rem" }}
                                    disabled={row.linesWithPkg <= 0 || row.totalPkg <= 0}
                                  />
                                </td>
                              ) : null}
                              <td>
                                <button
                                  type="button"
                                  className={btnClassSpaced}
                                  disabled={writeOff.isPending}
                                  onClick={() => submitWriteOffRow(writeOff, inputKey, row, row.batches, submitLabel)}
                                >
                                  Списать
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      : documentRows.map((row) => {
                          const inputKey = writeOffKeyDocument(row.rowKey);
                          const caliberInDoc = aggregateBatchesByCaliberLine(row.batches);
                          return (
                            <tr key={`wo-doc-${row.rowKey}`}>
                              <td>
                                {row.documentId ? (
                                  <Link
                                    to={purchaseNakladnayaDocumentPathForPath(pathname, row.documentId)}
                                    style={{ fontWeight: 600 }}
                                  >
                                    {row.displayLabel}
                                  </Link>
                                ) : (
                                  <strong>{row.displayLabel}</strong>
                                )}
                                <span className="birzha-text-muted birzha-text-muted--xs" style={{ marginLeft: 6 }}>
                                  {row.partCount} парт.
                                </span>
                              </td>
                              <td>
                                <ul
                                  className="birzha-ui-sm birzha-text-muted"
                                  style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.45 }}
                                >
                                  {caliberInDoc.map((cal) => (
                                    <li key={cal.lineLabel}>
                                      {cal.lineLabel} —{" "}
                                      {cal.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг
                                    </li>
                                  ))}
                                </ul>
                              </td>
                              <td className="birzha-data-table__num">
                                {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                              </td>
                              {writeOffShowsPackages ? (
                                <td className="birzha-data-table__num">
                                  {row.linesWithPkg > 0 && row.totalPkg > 0
                                    ? formatWriteOffPkg(row.totalPkg)
                                    : "—"}
                                </td>
                              ) : null}
                              <td>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="кг"
                                  value={writeOff.rejectInput[inputKey] ?? ""}
                                  onChange={(ev) => writeOff.onRejectInputChange(inputKey, ev.target.value)}
                                  aria-label={`Списать кг, ${row.displayLabel}`}
                                  style={{ ...fieldStyle, width: "5rem" }}
                                />
                              </td>
                              {writeOffShowsPackages ? (
                                <td>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="ящ."
                                    value={writeOff.rejectPkgInput[inputKey] ?? ""}
                                    onChange={(ev) => writeOff.onRejectPkgInputChange(inputKey, ev.target.value)}
                                    aria-label={`Списать ящики, ${row.displayLabel}`}
                                    style={{ ...fieldStyle, width: "4.5rem" }}
                                    disabled={row.linesWithPkg <= 0 || row.totalPkg <= 0}
                                  />
                                </td>
                              ) : null}
                              <td>
                                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                                  <button
                                    type="button"
                                    className={btnClassSpaced}
                                    disabled={writeOff.isPending}
                                    onClick={() => submitWriteOffRow(writeOff, inputKey, row, row.batches, row.displayLabel)}
                                  >
                                    Списать
                                  </button>
                                  <button
                                    type="button"
                                    className={btnClassInline}
                                    disabled={writeOff.isPending || row.totalKg <= 0}
                                    onClick={() => {
                                      const items = buildWriteOffItemsFromBatches(row.batches, row.totalKg);
                                      if (items.length > 0) {
                                        writeOff.onSubmitWriteOff(inputKey, items, `${row.displayLabel} (всё)`);
                                      }
                                    }}
                                  >
                                    Списать всё
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
              {writeOff.isError && writeOff.errorMessage ? (
                <ErrorAlert message={writeOff.errorMessage} title="Списание" />
              ) : null}
              {writeOff.undoError ? (
                <ErrorAlert message={writeOff.undoError} title="Возврат списания" />
              ) : null}
              <WriteOffRecentList
                rows={writeOff.recentWriteOffs}
                undoingWriteOffId={writeOff.undoingWriteOffId}
                onUndo={writeOff.onUndoWriteOff}
              />
            </div>
          ) : null}

          <h4
            className="loading-print-subhead"
            style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.35rem" }}
            id={stockTableLabelId}
          >
            Остаток в отборе (после списания)
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
            <span className="birzha-text-muted">Показать:</span>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="lm-stock-mode"
                checked={stockTableMode === "caliber"}
                onChange={() => setStockTableMode("caliber")}
              />
              по калибрам
            </label>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="lm-stock-mode"
                checked={stockTableMode === "nakladnaya"}
                onChange={() => setStockTableMode("nakladnaya")}
              />
              по накладным
            </label>
          </div>

          <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-nakl-lines-card">
            <table
              className="birzha-data-table birzha-data-table--compact loading-manifest-table"
              aria-labelledby={stockTableLabelId}
              aria-describedby={modeToggleId}
              aria-label={stockTableMode === "caliber" ? "Остаток по калибрам" : "Остаток по накладным"}
            >
              <thead>
                <tr>
                  {stockTableMode === "caliber" ? (
                    <th scope="col">Калибр (как в накладной)</th>
                  ) : (
                    <th scope="col">Накладная</th>
                  )}
                  <th scope="col" className="birzha-data-table__num">
                    На складе, кг
                  </th>
                  <th scope="col" className="birzha-data-table__num">
                    Ящ. (оц.)
                  </th>
                  <th scope="col" className="birzha-data-table__num">
                    Парт.
                  </th>
                </tr>
              </thead>
              <tbody>
                {stockTableMode === "caliber"
                  ? caliberRows.map((row) => (
                      <tr key={row.lineLabel}>
                        <td>
                          <span style={{ fontSize: "0.92rem", fontWeight: 600 }}>{row.lineLabel}</span>
                        </td>
                        <td className="birzha-data-table__num birzha-data-table__emph">
                          {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                        </td>
                        <td className="birzha-data-table__num">
                          {row.linesWithPkg === 0 ? "—" : `≈ ${row.totalPkg}`}
                        </td>
                        <td className="birzha-data-table__num">{row.partCount}</td>
                      </tr>
                    ))
                  : documentRows.map((row) => (
                      <tr key={row.rowKey}>
                        <td>
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
                        <td className="birzha-data-table__num birzha-data-table__emph">
                          {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                        </td>
                        <td className="birzha-data-table__num">
                          {row.linesWithPkg === 0 ? "—" : `≈ ${row.totalPkg}`}
                        </td>
                        <td className="birzha-data-table__num">{row.partCount}</td>
                      </tr>
                    ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" style={{ fontWeight: 700, textAlign: "left" }}>
                    Итого
                  </th>
                  <td className="birzha-data-table__num" style={{ fontWeight: 700 }}>
                    {totals.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="birzha-data-table__num" style={{ fontWeight: 700 }}>
                    {totals.linesWithPkg === 0 ? "—" : `≈ ${totals.pkg.toLocaleString("ru-RU")}`}
                  </td>
                  <td className="birzha-data-table__num" style={{ fontWeight: 700 }}>
                    {totals.batchCount}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
