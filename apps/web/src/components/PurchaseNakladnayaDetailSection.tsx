import {
  compareProductGradeCodes,
  kopecksToNakladnayaRubleFieldString,
  netKgFromGrossKg,
  nonnegativeDecimalStringToNumber,
} from "@birzha/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { putPurchaseDocumentLines } from "../api/fetch-api.js";
import type { ProductGradeJson, PurchaseDocumentLineDetail } from "../api/types.js";
import {
  purchaseDocumentDetailQueryOptions,
  productGradesFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { refreshPurchaseAndBatchLists } from "../query/domain-list-refresh.js";
import { useAuth } from "../auth/auth-context.js";
import { canManageInventoryCatalog } from "../auth/role-panels.js";
import { productGradeOptionLabel } from "../format/batch-label.js";
import { formatPurchaseDocDateRu } from "../format/purchase-doc-date.js";
import {
  NAKLADNAYA_NET_FROM_GROSS_HINT,
  nakladnayaLineSumFieldFromGrossKgPrice,
  nakladnayaNetKgFieldFromGross,
  purchaseLineDisplayGrossKg,
} from "../format/purchase-nakladnaya-line-sum.js";
import { kopecksToRubLabel } from "../format/money.js";
import { randomUuid } from "../lib/random-uuid.js";
import { purchaseNakladnayaBasePathForPath } from "../routes.js";
import {
  linePackageCountForNakladnayaSum,
  lineTotalKopecksForNakladnayaSum,
  parseReplacePurchaseDocumentLinesForm,
} from "../validation/api-schemas.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";
import { ErrorAlert, InfoAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, fieldStyle, selectFieldStyle, successText, thHeadDense, thtdDense } from "../ui/styles.js";

type EditLineDraft = {
  key: string;
  batchId?: string;
  productGradeId: string;
  /** Брутто, кг (с весов). */
  grossKg: string;
  packageCount: string;
  pricePerKg: string;
  lineTotalKopecks: string;
};

function lineToDraft(line: PurchaseDocumentLineDetail): EditLineDraft {
  const kop = Number(line.lineTotalKopecks);
  const gross = purchaseLineDisplayGrossKg(line.grossKg, line.totalKg, line.packageCount);
  return {
    key: line.batchId || randomUuid(),
    batchId: line.batchId,
    productGradeId: line.productGradeId,
    grossKg: String(gross).replace(".", ","),
    packageCount: line.packageCount?.trim() ?? "",
    pricePerKg: String(line.pricePerKg).replace(".", ","),
    lineTotalKopecks: Number.isFinite(kop)
      ? kopecksToNakladnayaRubleFieldString(kop)
      : "",
  };
}

function emptyEditLine(): EditLineDraft {
  return {
    key: randomUuid(),
    productGradeId: "",
    grossKg: "",
    packageCount: "",
    pricePerKg: "",
    lineTotalKopecks: "",
  };
}

function lockReasonLabel(reason: "in_loading_manifest" | "batch_moved" | null | undefined): string {
  if (reason === "in_loading_manifest") {
    return "Правка строк недоступна: партия уже в погрузочной накладной.";
  }
  if (reason === "batch_moved") {
    return "Правка строк недоступна: по партиям уже есть отгрузки, продажи или возвраты.";
  }
  return "Правка строк недоступна.";
}

export function PurchaseNakladnayaDetailSection() {
  const { documentId } = useParams<{ documentId: string }>();
  const { pathname } = useLocation();
  const { meta, user } = useAuth();
  const queryClient = useQueryClient();
  const listPath = purchaseNakladnayaBasePathForPath(pathname);
  const enabled = meta?.purchaseDocumentsApi === "enabled";
  const id = documentId ? decodeURIComponent(documentId) : "";
  const canEditAsAdmin = user ? canManageInventoryCatalog(user) : false;

  const warehousesQ = useQuery({
    ...warehousesFullListQueryOptions(),
    enabled: enabled && Boolean(id),
  });

  const gradesQ = useQuery({
    ...productGradesFullListQueryOptions(),
    enabled: enabled && Boolean(id) && canEditAsAdmin,
  });

  const docQ = useQuery({
    ...purchaseDocumentDetailQueryOptions(id),
    enabled: enabled && Boolean(id),
  });

  const [editLines, setEditLines] = useState<EditLineDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const linesEditable = docQ.data?.linesEditable === true;
  const showEditor = canEditAsAdmin && linesEditable;

  useEffect(() => {
    const d = docQ.data;
    if (!d) {
      return;
    }
    setEditLines(d.lines.map(lineToDraft));
    setFormError(null);
    setSavedMsg(null);
  }, [docQ.data]);

  const documentTotals = useMemo(() => {
    const d = docQ.data;
    if (!d) {
      return null;
    }
    let totalGrossKg = 0;
    let totalNetKg = 0;
    let totalPackages = 0;
    let lineKopSum = 0;
    for (const line of d.lines) {
      totalGrossKg += purchaseLineDisplayGrossKg(line.grossKg, line.totalKg, line.packageCount);
      totalNetKg += line.totalKg;
      totalPackages += linePackageCountForNakladnayaSum(line.packageCount ?? "");
      lineKopSum += lineTotalKopecksForNakladnayaSum(line.lineTotalKopecks);
    }
    const extraKop = lineTotalKopecksForNakladnayaSum(d.extraCostKopecks);
    const allKop = lineKopSum + extraKop;
    return { totalGrossKg, totalNetKg, totalPackages, lineKopSum, extraKop, allKop };
  }, [docQ.data]);

  const editFormTotals = useMemo(() => {
    let totalGrossKg = 0;
    let totalNetKg = 0;
    let totalPackages = 0;
    let lineKopSum = 0;
    for (const line of editLines) {
      const gross = nonnegativeDecimalStringToNumber(line.grossKg, 6);
      const pkgs = linePackageCountForNakladnayaSum(line.packageCount);
      if (Number.isFinite(gross) && gross > 0) {
        totalGrossKg += gross;
        try {
          totalNetKg += netKgFromGrossKg(gross, pkgs);
        } catch {
          /* нетто ≤ 0 — в итог нетто не включаем */
        }
      }
      totalPackages += pkgs;
      lineKopSum += lineTotalKopecksForNakladnayaSum(line.lineTotalKopecks);
    }
    return { totalGrossKg, totalNetKg, totalPackages, lineKopSum };
  }, [editLines]);

  const displayLines = useMemo(() => {
    const lines = docQ.data?.lines;
    if (!lines?.length) {
      return [];
    }
    return [...lines].sort((a, b) => {
      const c = compareProductGradeCodes(a.productGradeCode, b.productGradeCode);
      if (c !== 0) {
        return c;
      }
      return a.lineNo - b.lineNo;
    });
  }, [docQ.data?.lines]);

  const gradeOptionGroups = useMemo(() => {
    const list = (gradesQ.data?.productGrades ?? []).slice();
    list.sort((a, b) => {
      const ga = (a.productGroup ?? "").trim();
      const gb = (b.productGroup ?? "").trim();
      if (ga !== gb) {
        if (ga === "") return 1;
        if (gb === "") return -1;
        return ga.localeCompare(gb, "ru");
      }
      return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "ru");
    });
    const byKey = new Map<string, ProductGradeJson[]>();
    for (const g of list) {
      const groupKey = (g.productGroup ?? "").trim() || "";
      if (!byKey.has(groupKey)) {
        byKey.set(groupKey, []);
      }
      byKey.get(groupKey)!.push(g);
    }
    const keys = [...byKey.keys()].sort((a, b) => {
      if (a === "" && b !== "") return 1;
      if (b === "" && a !== "") return -1;
      return a.localeCompare(b, "ru");
    });
    return keys.map((k) => ({
      key: k || "__empty__",
      label: k === "" ? "Без группы товара" : k,
      grades: byKey.get(k)!,
    }));
  }, [gradesQ.data?.productGrades]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = parseReplacePurchaseDocumentLinesForm(editLines);
      await putPurchaseDocumentLines(
        id,
        body,
        "Недостаточно прав: правка строк накладной — только admin.",
      );
    },
    onSuccess: async () => {
      setFormError(null);
      setSavedMsg("Строки сохранены.");
      await queryClient.invalidateQueries({
        queryKey: purchaseDocumentDetailQueryOptions(id).queryKey,
      });
      await refreshPurchaseAndBatchLists(queryClient);
    },
    onError: (err: unknown) => {
      setSavedMsg(null);
      setFormError(err instanceof Error ? err.message : "Не удалось сохранить строки.");
    },
  });

  const updateLine = (key: string, patch: Partial<EditLineDraft>) => {
    setEditLines((prev) => prev.map((l) => (l.key !== key ? l : { ...l, ...patch })));
  };

  const updateLineWithAutoSum = (key: string, patch: Partial<EditLineDraft>) => {
    setEditLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) {
          return l;
        }
        const next = { ...l, ...patch };
        if ("grossKg" in patch || "packageCount" in patch || "pricePerKg" in patch) {
          next.lineTotalKopecks = nakladnayaLineSumFieldFromGrossKgPrice(
            next.grossKg,
            next.packageCount,
            next.pricePerKg,
          );
        }
        return next;
      }),
    );
  };

  const warehouseLabel = (wid: string) => {
    const w = warehousesQ.data?.warehouses.find((x) => x.id === wid);
    return w ? `${w.name} (${w.code})` : wid;
  };

  if (!enabled) {
    return (
      <InfoAlert title="Раздел недоступен">
        Раздел накладных временно недоступен. Обратитесь к администратору.
      </InfoAlert>
    );
  }

  if (!id) {
    return <ErrorAlert message="Не удалось открыть накладную." />;
  }

  if (docQ.isPending) {
    return <LoadingBlock label="Загрузка накладной…" minHeight={100} skeleton skeletonRows={6} />;
  }

  if (docQ.isError) {
    return <ErrorAlert error={docQ.error} title="Накладная" />;
  }

  const doc = docQ.data;
  if (!doc) {
    return (
      <div className="birzha-panel">
        <ErrorAlert message="Документ не найден." />
        <Link to={listPath} style={{ fontSize: "0.92rem" }}>
          ← Назад к закупке товара
        </Link>
      </div>
    );
  }

  const totals = documentTotals;
  const kgFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6, useGrouping: true });
  const pkgFmt = new Intl.NumberFormat("ru-RU", { useGrouping: true, maximumFractionDigits: 0 });
  const totalGrossKgLabel = kgFmt.format(totals?.totalGrossKg ?? 0);
  const totalNetKgLabel = kgFmt.format(totals?.totalNetKg ?? 0);
  const editGrossKgLabel = kgFmt.format(editFormTotals.totalGrossKg);
  const editNetKgLabel = kgFmt.format(editFormTotals.totalNetKg);

  return (
    <section
      className="birzha-panel birzha-purchase-nakl-print"
      aria-labelledby="nakl-detail-heading"
      role="region"
      aria-label="Карточка закупочной накладной"
    >
      <BirzhaDisclosure
        defaultOpen
        title={
          <h3 id="nakl-detail-heading" style={{ margin: 0, fontSize: "1rem" }}>
            Накладная · <strong>{doc.supplierName?.trim() || doc.documentNumber}</strong>
            <span className="birzha-text-muted birzha-ui-sm" style={{ marginLeft: "0.5rem", fontWeight: 500 }}>
              {formatPurchaseDocDateRu(doc.docDate)}
            </span>
          </h3>
        }
      >
      <div
        className="no-print"
        style={{
          marginBottom: "0.5rem",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.5rem 0.75rem",
        }}
      >
        <Link to={listPath} className="birzha-ui-sm">
          ← Все закупки товара
        </Link>
        <button
          type="button"
          className="birzha-btn-ghost"
          title="Откроется окно печати браузера; выберите «Сохранить как PDF», если нужен файл."
          onClick={() => {
            globalThis.window?.print();
          }}
        >
          Печать / PDF
        </button>
      </div>

      <div className="birzha-nakl-detail-meta">
        <div>
          <strong>Склад:</strong>{" "}
          {warehousesQ.isPending ? (
            <LoadingIndicator size="sm" label="Загрузка склада…" />
          ) : warehousesQ.isError ? (
            <span className="birzha-text-muted">склад не загрузился</span>
          ) : (
            warehouseLabel(doc.warehouseId)
          )}
        </div>
        {doc.buyerLabel && (
          <div>
            <strong>Покупатель / подпись:</strong> {doc.buyerLabel}
          </div>
        )}
        {totals && totals.extraKop > 0 && (
          <div>
            <strong>Доп. расходы:</strong> {kopecksToRubLabel(String(doc.extraCostKopecks))} ₽
          </div>
        )}
      </div>

      {canEditAsAdmin && !linesEditable ? (
        <InfoAlert title="Строки только для просмотра">{lockReasonLabel(doc.linesEditLockReason)}</InfoAlert>
      ) : null}

      {showEditor ? (
        <>
          {formError ? <ErrorAlert message={formError} /> : null}
          {savedMsg ? <p style={successText}>{savedMsg}</p> : null}
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-nakl-lines-card birzha-nakl-lines-card--form no-print">
            <table className="birzha-nakl-lines-table">
              <thead>
                <tr>
                  <th className="birzha-nakl-lines-table__grade">Товар / калибр</th>
                  <th className="birzha-nakl-lines-table__num">Брутто, кг</th>
                  <th className="birzha-nakl-lines-table__num">Ящики</th>
                  <th className="birzha-nakl-lines-table__num" title={NAKLADNAYA_NET_FROM_GROSS_HINT}>
                    Нетто, кг
                  </th>
                  <th className="birzha-nakl-lines-table__num">₽/кг</th>
                  <th
                    className="birzha-nakl-lines-table__num"
                    title="Считается автоматически: нетто × ₽/кг"
                  >
                    Сумма
                  </th>
                  <th className="birzha-nakl-lines-table__actions" />
                </tr>
              </thead>
              <tbody>
                {editLines.map((line) => (
                  <tr key={line.key}>
                    <td className="birzha-nakl-lines-table__grade-cell" data-label="Товар / калибр">
                      <BirzhaSelect
                        value={line.productGradeId}
                        onChange={(v) => updateLine(line.key, { productGradeId: v })}
                        className="birzha-nakl-line-field birzha-nakl-line-field--grade birzha-clean-ops-field"
                        style={{ ...selectFieldStyle, marginTop: 0 }}
                        disabled={gradesQ.isPending}
                        placeholder={gradesQ.isPending ? "Загрузка…" : "— выберите —"}
                        groups={gradeOptionGroups.map((grp) => ({
                          label: grp.label,
                          options: grp.grades.map((g) => ({
                            value: g.id,
                            label: productGradeOptionLabel(g.code, g.displayName),
                          })),
                        }))}
                      />
                    </td>
                    <td className="birzha-nakl-lines-table__num-cell" data-label="Брутто, кг">
                      <input
                        value={line.grossKg}
                        onChange={(e) => updateLineWithAutoSum(line.key, { grossKg: e.target.value })}
                        className="birzha-nakl-line-field birzha-nakl-line-field--numeric"
                        style={fieldStyle}
                        inputMode="decimal"
                        aria-label="Брутто, кг"
                      />
                    </td>
                    <td className="birzha-nakl-lines-table__num-cell" data-label="Ящики">
                      <input
                        value={line.packageCount}
                        onChange={(e) => updateLineWithAutoSum(line.key, { packageCount: e.target.value })}
                        className="birzha-nakl-line-field birzha-nakl-line-field--numeric"
                        style={fieldStyle}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label="Ящики"
                      />
                    </td>
                    <td className="birzha-nakl-lines-table__num-cell" data-label="Нетто, кг">
                      <input
                        value={nakladnayaNetKgFieldFromGross(line.grossKg, line.packageCount)}
                        readOnly
                        tabIndex={-1}
                        className="birzha-nakl-line-field birzha-nakl-line-field--numeric"
                        style={{ ...fieldStyle, background: "var(--color-surface-muted, #f3f4f6)" }}
                        title={NAKLADNAYA_NET_FROM_GROSS_HINT}
                        aria-label="Нетто, кг"
                      />
                    </td>
                    <td className="birzha-nakl-lines-table__num-cell" data-label="₽/кг">
                      <input
                        value={line.pricePerKg}
                        onChange={(e) => updateLineWithAutoSum(line.key, { pricePerKg: e.target.value })}
                        className="birzha-nakl-line-field birzha-nakl-line-field--numeric"
                        style={fieldStyle}
                        inputMode="decimal"
                      />
                    </td>
                    <td className="birzha-nakl-lines-table__num-cell" data-label="Сумма">
                      <input
                        value={line.lineTotalKopecks}
                        onChange={(e) => updateLine(line.key, { lineTotalKopecks: e.target.value })}
                        className="birzha-nakl-line-field birzha-nakl-line-field--numeric"
                        style={fieldStyle}
                        inputMode="decimal"
                        title="Считается автоматически: нетто × ₽/кг; можно править вручную"
                      />
                    </td>
                    <td className="birzha-nakl-lines-table__actions-cell">
                      <button
                        type="button"
                        className="birzha-btn-ghost"
                        disabled={editLines.length <= 1 || saveMutation.isPending}
                        onClick={() =>
                          setEditLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== line.key)))
                        }
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="birzha-nakl-lines-table__total-label">
                    Итого
                  </th>
                  <td className="birzha-nakl-lines-table__total-cell" title="Сумма брутто по строкам">
                    {editGrossKgLabel}{" "}
                    <span className="birzha-text-muted birzha-text-muted--xs">кг</span>
                  </td>
                  <td className="birzha-nakl-lines-table__total-cell">
                    {pkgFmt.format(editFormTotals.totalPackages)}{" "}
                    <span className="birzha-text-muted birzha-text-muted--xs">ящ.</span>
                  </td>
                  <td
                    className="birzha-nakl-lines-table__total-cell"
                    title={`Сумма нетто (${NAKLADNAYA_NET_FROM_GROSS_HINT})`}
                  >
                    {editNetKgLabel}{" "}
                    <span className="birzha-text-muted birzha-text-muted--xs">кг</span>
                  </td>
                  <td className="birzha-text-muted birzha-nakl-lines-table__total-cell birzha-nakl-lines-table__total-skip">
                    —
                  </td>
                  <td className="birzha-nakl-lines-table__total-sum">
                    {kopecksToRubLabel(editFormTotals.lineKopSum.toString())} ₽
                  </td>
                  <td className="birzha-text-subtle birzha-nakl-lines-table__total-actions birzha-nakl-lines-table__total-skip" />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button
              type="button"
              className={btnClassSpaced}
              disabled={saveMutation.isPending}
              onClick={() => setEditLines((prev) => [...prev, emptyEditLine()])}
            >
              Добавить строку
            </button>
            <button
              type="button"
              className={btnClassSpaced}
              disabled={saveMutation.isPending || editLines.length === 0}
              onClick={() => {
                setFormError(null);
                setSavedMsg(null);
                saveMutation.mutate();
              }}
            >
              {saveMutation.isPending ? "Сохранение…" : "Сохранить"}
            </button>
            <button
              type="button"
              className="birzha-btn-ghost"
              disabled={saveMutation.isPending}
              onClick={() => {
                setEditLines(doc.lines.map(lineToDraft));
                setFormError(null);
                setSavedMsg(null);
              }}
            >
              Отменить
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="birzha-nakl-lines-heading">Строки (каждая строка — партия)</p>
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ borderCollapse: "collapse", fontSize: "0.85rem", width: "100%" }}>
              <thead>
                <tr>
                  <th style={thHeadDense}>№</th>
                  <th style={thHeadDense}>Калибр</th>
                  <th style={thHeadDense}>Брутто, кг</th>
                  <th style={thHeadDense}>Ящики</th>
                  <th style={thHeadDense} title={NAKLADNAYA_NET_FROM_GROSS_HINT}>
                    Нетто, кг
                  </th>
                  <th style={thHeadDense}>₽/кг</th>
                  <th style={thHeadDense}>Сумма, ₽</th>
                </tr>
              </thead>
              <tbody>
                {displayLines.map((line) => (
                  <tr key={`${line.lineNo}-${line.batchId}`}>
                    <td style={thtdDense}>{line.lineNo}</td>
                    <td style={thtdDense}>{line.productGradeCode}</td>
                    <td style={thtdDense}>
                      {purchaseLineDisplayGrossKg(line.grossKg, line.totalKg, line.packageCount)}
                    </td>
                    <td style={thtdDense}>{line.packageCount ?? "—"}</td>
                    <td style={thtdDense}>{line.totalKg}</td>
                    <td style={thtdDense}>{line.pricePerKg}</td>
                    <td style={thtdDense}>{kopecksToRubLabel(String(line.lineTotalKopecks))} ₽</td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="birzha-table-subtotal-row">
                    <th colSpan={2} scope="row" style={{ ...thtdDense, textAlign: "right" }}>
                      {totals.extraKop > 0 ? "Итого по строкам" : "Всего по документу"}
                    </th>
                    <td style={{ ...thtdDense, fontWeight: 600 }} title="Сумма брутто по строкам">
                      {totalGrossKgLabel}{" "}
                      <span className="birzha-text-muted birzha-text-muted--sm">кг</span>
                    </td>
                    <td style={{ ...thtdDense, fontWeight: 600 }}>
                      {pkgFmt.format(totals.totalPackages)}{" "}
                      <span className="birzha-text-muted birzha-text-muted--sm">ящ.</span>
                    </td>
                    <td
                      style={{ ...thtdDense, fontWeight: 600 }}
                      title={`Сумма нетто (${NAKLADNAYA_NET_FROM_GROSS_HINT})`}
                    >
                      {totalNetKgLabel}{" "}
                      <span className="birzha-text-muted birzha-text-muted--sm">кг</span>
                    </td>
                    <td className="birzha-text-muted" style={{ ...thtdDense }}>
                      —
                    </td>
                    <td
                      style={{
                        ...thtdDense,
                        fontWeight: totals.extraKop > 0 ? 600 : 700,
                        fontSize: totals.extraKop > 0 ? undefined : "0.95rem",
                      }}
                    >
                      {kopecksToRubLabel(totals.lineKopSum.toString())} ₽
                    </td>
                  </tr>
                  {totals.extraKop > 0 && (
                    <tr className="birzha-table-subtotal-row">
                      <th colSpan={6} scope="row" style={{ ...thtdDense, textAlign: "right" }}>
                        Доп. расходы (см. шапку)
                      </th>
                      <td style={thtdDense}>{kopecksToRubLabel(totals.extraKop.toString())} ₽</td>
                    </tr>
                  )}
                  {totals.extraKop > 0 && (
                    <tr className="birzha-table-subtotal-row birzha-table-subtotal-row--emphasis">
                      <th colSpan={6} scope="row" style={{ ...thtdDense, textAlign: "right" }}>
                        Всего по документу
                      </th>
                      <td style={{ ...thtdDense, fontWeight: 700, fontSize: "0.95rem" }}>
                        {kopecksToRubLabel(totals.allKop.toString())} ₽
                      </td>
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      </BirzhaDisclosure>
    </section>
  );
}
