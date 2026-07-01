import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { apiPostJson } from "../api/fetch-api.js";
import type {
  CreatePurchaseDocumentResponse,
  ProductGradeJson,
  PurchaseDocumentSummary,
  WarehouseJson,
} from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import {
  kopecksFromNakladnayaAmountField,
  kopecksToNakladnayaRubleFieldString,
  nonnegativeDecimalStringToNumber,
  purchaseLineAmountKopecksFromDecimalStrings,
} from "@birzha/contracts";

import {
  linePackageCountForNakladnayaSum,
  lineTotalKopecksForNakladnayaSum,
  parseCreatePurchaseDocumentForm,
} from "../validation/api-schemas.js";
import { filterPurchaseDocumentsInWork } from "../format/archive.js";
import { productGradeOptionLabel } from "../format/batch-label.js";
import { formatPurchaseDocDateRu } from "../format/purchase-doc-date.js";
import { kopecksToRubLabel } from "../format/money.js";
import { randomUuid } from "../lib/random-uuid.js";
import { canManageInventoryCatalog } from "../auth/role-panels.js";
import { readPreferredWarehouseId, writePreferredWarehouseId } from "../preferences/ops-preferred-warehouse.js";
import {
  batchesFullListQueryOptions,
  productGradesFullListQueryOptions,
  purchaseDocumentsFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { refreshPurchaseAndBatchLists } from "../query/domain-list-refresh.js";
import { adminAwarePathForPath, adminRoutes, login, ops, purchaseNakladnayaDocumentPathForPath } from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { BirzhaPagination } from "../ui/BirzhaPagination.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";
import { ErrorAlert, InfoAlert, WarningAlert } from "../ui/ErrorAlerts.js";
import {
  btnClassSpaced,
  dateFieldStyle,
  fieldStyle,
  selectFieldStyle,
  successText,
} from "../ui/styles.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";

const NAKLAD_LIST_PAGE_SIZE = 25;

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type LineDraft = {
  key: string;
  productGradeId: string;
  totalKg: string;
  packageCount: string;
  pricePerKg: string;
  lineTotalKopecks: string;
};

function emptyLine(): LineDraft {
  return {
    key: randomUuid(),
    productGradeId: "",
    totalKg: "",
    packageCount: "",
    pricePerKg: "",
    lineTotalKopecks: "",
  };
}

export function PurchaseNakladnayaSection() {
  const { pathname } = useLocation();
  const { meta, user } = useAuth();
  const canManageCatalog = user ? canManageInventoryCatalog(user) : false;
  const queryClient = useQueryClient();
  const enabled = meta?.purchaseDocumentsApi === "enabled";

  const warehousesQ = useQuery({ ...warehousesFullListQueryOptions(), enabled });
  const gradesQ = useQuery({ ...productGradesFullListQueryOptions(), enabled });
  const listQ = useQuery({ ...purchaseDocumentsFullListQueryOptions(), enabled });
  const batchesQ = useQuery({ ...batchesFullListQueryOptions(), enabled });

  const [docDate, setDocDate] = useState(todayIsoDate);
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [buyerLabel, setBuyerLabel] = useState("");
  const [extraCostKopecks, setExtraCostKopecks] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
  const [nakladListPage, setNakladListPage] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);
  const refreshLists = useCallback(async () => {
    await refreshPurchaseAndBatchLists(queryClient);
  }, [queryClient]);

  const submit = useMutation({
    mutationFn: async () => {
      setFormError(null);
      setLastOk(null);
      const body = parseCreatePurchaseDocumentForm({
        docDate,
        warehouseId,
        supplierName,
        buyerLabel,
        extraCostKopecks,
        lines,
      });
      return apiPostJson("/api/purchase-documents", body) as Promise<CreatePurchaseDocumentResponse>;
    },
    onSuccess: async () => {
      setLastOk("Накладная сохранена.");
      setFormError(null);
      setDocDate(todayIsoDate());
      setWarehouseId("");
      setSupplierName("");
      setBuyerLabel("");
      setExtraCostKopecks("0");
      setLines([emptyLine()]);
      await refreshLists();
    },
    onError: (e: Error) => {
      setFormError(e.message);
    },
  });

  const activePurchaseDocs = useMemo(() => {
    const docs = listQ.data?.purchaseDocuments ?? [];
    if (!batchesQ.isSuccess) {
      return [];
    }
    return filterPurchaseDocumentsInWork(docs, batchesQ.data.batches);
  }, [listQ.data?.purchaseDocuments, batchesQ.isSuccess, batchesQ.data?.batches]);

  const archivePath = adminAwarePathForPath(pathname, adminRoutes.archive, ops.archive);

  const nakladPageCount = Math.max(1, Math.ceil(activePurchaseDocs.length / NAKLAD_LIST_PAGE_SIZE));

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(activePurchaseDocs.length / NAKLAD_LIST_PAGE_SIZE) - 1);
    setNakladListPage((p) => Math.min(p, maxPage));
  }, [activePurchaseDocs.length]);

  const nakladPageSlice = useMemo(() => {
    const start = nakladListPage * NAKLAD_LIST_PAGE_SIZE;
    return activePurchaseDocs.slice(start, start + NAKLAD_LIST_PAGE_SIZE);
  }, [activePurchaseDocs, nakladListPage]);

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const fillLineKopecks = (key: string) => {
    const row = lines.find((l) => l.key === key);
    if (!row) {
      return;
    }
    const k = purchaseLineAmountKopecksFromDecimalStrings(row.totalKg, row.pricePerKg);
    if (!Number.isFinite(k) || k < 0) {
      return;
    }
    updateLine(key, { lineTotalKopecks: kopecksToNakladnayaRubleFieldString(k) });
  };

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
      const key = (g.productGroup ?? "").trim() || "";
      if (!byKey.has(key)) {
        byKey.set(key, []);
      }
      byKey.get(key)!.push(g);
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

  const warehouseCount = warehousesQ.data?.warehouses?.length ?? 0;
  const gradeCount = gradesQ.data?.productGrades?.length ?? 0;

  useEffect(() => {
    if (warehouseId !== "" || !warehousesQ.isSuccess || warehouseCount === 0) {
      return;
    }
    const list = warehousesQ.data?.warehouses ?? [];
    const ids = list.map((w) => w.id);
    const pref = readPreferredWarehouseId();
    if (pref && ids.includes(pref)) {
      setWarehouseId(pref);
      return;
    }
    if (list.length === 1) {
      setWarehouseId(list[0]!.id);
    }
  }, [warehouseId, warehouseCount, warehousesQ.data?.warehouses, warehousesQ.isSuccess]);
  const catalogsEmptyOk =
    warehousesQ.isSuccess && gradesQ.isSuccess && (warehouseCount === 0 || gradeCount === 0);

  const extraCostKopecksForTotals = useMemo(() => {
    const t = extraCostKopecks.trim();
    if (t === "") {
      return 0;
    }
    return kopecksFromNakladnayaAmountField(t) ?? 0;
  }, [extraCostKopecks]);

  const nakladnayaFormTotals = useMemo(() => {
    let totalKg = 0;
    let totalPackages = 0;
    let totalLineKopecks = 0;
    for (const line of lines) {
      const kg = nonnegativeDecimalStringToNumber(line.totalKg, 6);
      if (Number.isFinite(kg) && kg > 0) {
        totalKg += kg;
      }
      totalPackages += linePackageCountForNakladnayaSum(line.packageCount);
      totalLineKopecks += lineTotalKopecksForNakladnayaSum(line.lineTotalKopecks);
    }
    const totalAllKopecks = totalLineKopecks + extraCostKopecksForTotals;
    return { totalKg, totalPackages, totalLineKopecks, totalAllKopecks };
  }, [lines, extraCostKopecksForTotals]);

  const totalKgLabel = useMemo(
    () =>
      new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6, useGrouping: true }).format(
        Number.isFinite(nakladnayaFormTotals.totalKg) ? nakladnayaFormTotals.totalKg : 0,
      ),
    [nakladnayaFormTotals.totalKg],
  );

  const catalogLoadErrorText = useMemo(() => {
    if (!warehousesQ.isError && !gradesQ.isError) {
      return null;
    }
    const e = warehousesQ.error ?? gradesQ.error;
    const m = e instanceof Error ? e.message : String(e);
    if (/\b401\b/.test(m)) {
      return meta?.requireApiAuth === "enabled" ? (
        <>
          Справочники не загрузились: нужна авторизация. Откройте{" "}
          <Link to={login} style={{ fontWeight: 600 }}>
            Вход
          </Link>
          {user ? " (сессия могла истечь — войдите снова)." : "."}
        </>
      ) : (
        <>Сессия не подтверждена — войдите заново или обратитесь к администратору.</>
      );
    }
    if (/\b403\b/.test(m)) {
      return <>Доступ запрещён (403). Нужна роль с правом закупки товара (закупщик, кладовщик, admin и т.д.).</>;
    }
    return <>Не загрузились склады или калибры: {m}</>;
  }, [warehousesQ.isError, warehousesQ.error, gradesQ.isError, gradesQ.error, meta?.requireApiAuth, user]);

  if (!enabled) {
    return (
      <section className="birzha-panel birzha-clean-ops-page" aria-labelledby="nakl-disabled" role="region" aria-label="Закупка товара">
        <BirzhaDisclosure
          defaultOpen
          className="birzha-clean-ops-disclosure"
          title={
            <h3 id="nakl-disabled" style={{ margin: 0, fontSize: "0.98rem" }}>
              Закупка товара
            </h3>
          }
        >
          <p className="birzha-callout-warning" role="status">
            Раздел накладных временно недоступен. Проверьте подключение к серверу или обратитесь к администратору.
          </p>
        </BirzhaDisclosure>
      </section>
    );
  }

  return (
    <section className="birzha-panel birzha-clean-ops-page" aria-labelledby="nakl-heading" role="region" aria-label="Закупка товара">
      <BirzhaDisclosure
        defaultOpen
        className="birzha-clean-ops-disclosure"
        title={
          <div className="birzha-section-heading">
            <div>
              <p className="birzha-section-heading__eyebrow">Приёмка</p>
              <h3 id="nakl-heading" className="birzha-section-title birzha-section-title--sm">
                Закупка товара
              </h3>
            </div>
          </div>
        }
      >
      {catalogLoadErrorText ? <WarningAlert title="Справочники">{catalogLoadErrorText}</WarningAlert> : null}
      {catalogsEmptyOk && canManageCatalog ? (
        <InfoAlert title="Справочники пусты">
          В справочнике нет складов или калибров — нечего выбирать в списках. Добавьте их в разделе{" "}
          <strong>Настройки</strong> (кабинет админа) или попросите администратора проверить начальные справочники.
        </InfoAlert>
      ) : null}
      {catalogsEmptyOk && !canManageCatalog ? (
        <InfoAlert title="Справочники пусты">
          В справочнике нет складов или калибров — обратитесь к администратору, чтобы настроить справочники в кабинете{" "}
          <strong>админа</strong> (склады и калибры), либо попросите применить миграции на сервере.
        </InfoAlert>
      ) : null}
      {(warehousesQ.isPending || gradesQ.isPending) && (
        <LoadingBlock label="Загрузка справочников складов и калибров…" minHeight={56} skeleton skeletonRows={3} />
      )}
      <div className="birzha-clean-ops-meta-grid">
        <label className="birzha-form-label">
          Поставщик *
          <input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            style={fieldStyle}
            placeholder="Теплица / отправитель"
            autoComplete="organization"
          />
        </label>
        <label className="birzha-form-label" htmlFor="nakl-doc-date">
          Дата *
          <BirzhaDateField
            id="nakl-doc-date"
            value={docDate}
            onChange={setDocDate}
            style={dateFieldStyle}
            className="birzha-input-date"
          />
        </label>
        <label className="birzha-form-label">
          Склад *
          <BirzhaSelect
            value={warehouseId}
            onChange={(v) => {
              setWarehouseId(v);
              writePreferredWarehouseId(v === "" ? null : v);
            }}
            className="birzha-clean-ops-field"
            style={selectFieldStyle}
            placeholder="— выберите —"
            options={[
              { value: "", label: "— выберите —" },
              ...(warehousesQ.data?.warehouses ?? []).map((w) => ({
                value: w.id,
                label: `${w.name} (${w.code})`,
              })),
            ]}
          />
        </label>
        <label className="birzha-form-label">
          Покупатель / подпись (опц.)
          <input value={buyerLabel} onChange={(e) => setBuyerLabel(e.target.value)} style={fieldStyle} />
        </label>
      </div>

      {!gradesQ.isPending && gradeCount === 0 && !gradesQ.isError && canManageCatalog ? (
        <InfoAlert title="Нет калибров">
          В справочнике нет калибров. Добавьте калибры в{" "}
          <Link to={adminRoutes.settingsCatalog} style={{ fontWeight: 600 }}>
            кабинете админа — «Настройки»
          </Link>
          , обновите страницу.
        </InfoAlert>
      ) : null}
      {!gradesQ.isPending && gradeCount === 0 && !gradesQ.isError && !canManageCatalog ? (
        <InfoAlert title="Нет калибров">
          В справочнике нет калибров — пусть администратор добавит их в «Настройках».
        </InfoAlert>
      ) : null}
      <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-nakl-lines-card birzha-nakl-lines-card--form">
        <table className="birzha-nakl-lines-table">
          <thead>
            <tr>
              <th className="birzha-nakl-lines-table__grade">Товар / калибр</th>
              <th className="birzha-nakl-lines-table__num">Кг</th>
              <th className="birzha-nakl-lines-table__num">Ящики</th>
              <th className="birzha-nakl-lines-table__num">₽/кг</th>
              <th
                className="birzha-nakl-lines-table__num"
                title="Сумма строки в копейках: целое число (50000) или «руб,коп» (16470,00). Кнопка «=кг×цена» подставит расчёт."
              >
                Сумма, коп.
              </th>
              <th className="birzha-nakl-lines-table__actions" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
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
                <td className="birzha-nakl-lines-table__num-cell" data-label="Кг">
                  <input
                    value={line.totalKg}
                    onChange={(e) => updateLine(line.key, { totalKg: e.target.value })}
                    className="birzha-nakl-line-field birzha-nakl-line-field--numeric"
                    style={fieldStyle}
                    inputMode="decimal"
                  />
                </td>
                <td className="birzha-nakl-lines-table__num-cell" data-label="Ящики">
                  <input
                    value={line.packageCount}
                    onChange={(e) => updateLine(line.key, { packageCount: e.target.value })}
                    className="birzha-nakl-line-field birzha-nakl-line-field--numeric"
                    style={fieldStyle}
                    inputMode="decimal"
                    autoComplete="off"
                    title="Ящики, целое; можно 10,5 (округлит)"
                  />
                </td>
                <td className="birzha-nakl-lines-table__num-cell" data-label="₽/кг">
                  <input
                    value={line.pricePerKg}
                    onChange={(e) => updateLine(line.key, { pricePerKg: e.target.value })}
                    className="birzha-nakl-line-field birzha-nakl-line-field--numeric"
                    style={fieldStyle}
                    inputMode="decimal"
                  />
                </td>
                <td className="birzha-nakl-lines-table__num-cell" data-label="Сумма, коп.">
                  <input
                    value={line.lineTotalKopecks}
                    onChange={(e) => updateLine(line.key, { lineTotalKopecks: e.target.value })}
                    className="birzha-nakl-line-field birzha-nakl-line-field--sum"
                    style={fieldStyle}
                    inputMode="decimal"
                    autoComplete="off"
                    title="Копейки: целое число или «руб,коп»; кнопка «=кг×цена» подставит сумму по кг × ₽/кг"
                  />
                </td>
                <td className="birzha-nakl-lines-table__actions-cell" data-label="Действия">
                  <div className="birzha-nakl-line-actions">
                    <button
                      type="button"
                      className="birzha-nakl-line-action birzha-nakl-line-action--calc"
                      onClick={() => fillLineKopecks(line.key)}
                      title="Подставить сумму строки: кг × ₽/кг (допуск ±1 коп.)"
                    >
                      =кг×цена
                    </button>
                    <button
                      type="button"
                      className="birzha-nakl-line-action birzha-nakl-line-action--remove"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length <= 1}
                      aria-label="Удалить строку"
                      title="Удалить строку"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope="row"
                className="birzha-nakl-lines-table__total-label"
                title="Складываются все строки при вводе"
              >
                Итого
              </th>
              <td
                className="birzha-nakl-lines-table__total-cell"
                title="Сумма кг по строкам, где кг &gt; 0"
              >
                {totalKgLabel}{" "}
                <span className="birzha-text-muted birzha-text-muted--xs">
                  кг
                </span>
              </td>
              <td
                className="birzha-nakl-lines-table__total-cell"
                title="Сумма ящиков; пустое поле = 0"
              >
                {new Intl.NumberFormat("ru-RU", { useGrouping: true, maximumFractionDigits: 0 }).format(
                  nakladnayaFormTotals.totalPackages,
                )}{" "}
                <span className="birzha-text-muted birzha-text-muted--xs">
                  ящ.
                </span>
              </td>
              <td
                className="birzha-text-muted birzha-nakl-lines-table__total-cell birzha-nakl-lines-table__total-skip"
              >
                —
              </td>
              <td colSpan={1} className="birzha-nakl-lines-table__total-sum">
                <span>{kopecksToRubLabel(nakladnayaFormTotals.totalLineKopecks.toString())} ₽</span>
                {extraCostKopecksForTotals > 0 && (
                  <div style={{ fontSize: "0.8rem", marginTop: 6, fontWeight: 600, color: "var(--color-text)" }}>
                    Всего (строки + доп.): {kopecksToRubLabel(nakladnayaFormTotals.totalAllKopecks.toString())} ₽
                    <div className="birzha-text-subtle" style={{ fontSize: "0.76rem", fontWeight: 400, marginTop: 2 }}>
                      (доп. расходы: {kopecksToRubLabel(extraCostKopecksForTotals.toString())} ₽)
                    </div>
                  </div>
                )}
              </td>
              <td className="birzha-text-subtle birzha-nakl-lines-table__total-actions birzha-nakl-lines-table__total-skip" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="birzha-nakl-form-actions">
        <button type="button" className={btnClassSpaced} onClick={addLine}>
          Добавить строку
        </button>
        <button
          type="button"
          className={btnClassSpaced}
          onClick={() => void submit.mutate()}
          disabled={submit.isPending}
        >
          {submit.isPending ? "Отправка…" : "Создать накладную"}
        </button>
      </p>

      {formError ? <ErrorAlert message={formError} title="Создание накладной" /> : null}
      {lastOk && <p style={successText}>{lastOk}</p>}
      </BirzhaDisclosure>

      {listQ.isPending && (
        <LoadingBlock label="Загрузка списка накладных…" minHeight={80} skeleton skeletonRows={5} />
      )}

      {listQ.isFetching && !listQ.isPending && (
        <p style={{ margin: "0.35rem 0" }} role="status" aria-live="polite">
          <LoadingIndicator size="sm" label="Обновление списка накладных…" />
        </p>
      )}

      {listQ.data && listQ.data.purchaseDocuments.length === 0 && !listQ.isPending && (
        <div className="birzha-clean-ops-list birzha-clean-ops-list--empty">
          <BirzhaEmptyState compact title="Сохранённых накладных пока нет" description="Создайте документ формой выше." />
        </div>
      )}

      {listQ.data && listQ.data.purchaseDocuments.length > 0 && (
        <div className="birzha-clean-ops-list">
          <h4 className="birzha-clean-ops-list__title">
            В работе
            {batchesQ.isSuccess ? (
              <span className="birzha-text-muted" style={{ fontWeight: 400 }}>
                {" "}
                ({activePurchaseDocs.length})
              </span>
            ) : null}
          </h4>
          {batchesQ.isPending && (
            <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }} role="status">
              Уточняем остатки по партиям…
            </p>
          )}
          {batchesQ.isSuccess && activePurchaseDocs.length === 0 ? (
            <BirzhaEmptyState
              compact
              title="Нет накладных в работе"
              description={
                <>
                  Проданные и без остатка — в разделе{" "}
                  <Link to={archivePath}>«Архив»</Link>.
                </>
              }
            />
          ) : null}
          {batchesQ.isSuccess && activePurchaseDocs.length > 0 ? (
            <>
              <PurchaseNakladnayaDocTable
                docs={nakladPageSlice}
                pathname={pathname}
                warehouses={warehousesQ.data?.warehouses ?? []}
              />
              <BirzhaPagination
                pageIndex={nakladListPage}
                pageCount={nakladPageCount}
                itemLabel="накладных"
                onPageChange={setNakladListPage}
              />
            </>
          ) : null}

        </div>
      )}
    </section>
  );
}

function PurchaseNakladnayaDocTable({
  docs,
  pathname,
  warehouses,
}: {
  docs: PurchaseDocumentSummary[];
  pathname: string;
  warehouses: WarehouseJson[];
}) {
  return (
    <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-nakl-lines-card">
      <table className="birzha-data-table birzha-data-table--compact">
        <thead>
          <tr>
            <th>Номер</th>
            <th>Дата</th>
            <th>Склад</th>
            <th>Строк</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const wh = warehouses.find((w) => w.id === d.warehouseId);
            return (
              <tr key={d.id}>
                <td>
                  <Link to={purchaseNakladnayaDocumentPathForPath(pathname, d.id)} style={{ fontWeight: 600 }}>
                    {d.documentNumber}
                  </Link>
                </td>
                <td className="birzha-data-table__emph">{formatPurchaseDocDateRu(d.docDate)}</td>
                <td>
                  {wh ? (
                    <>
                      {wh.name} <span className="birzha-text-muted">({wh.code})</span>
                    </>
                  ) : (
                    <span className="birzha-text-muted">—</span>
                  )}
                </td>
                <td>{d.lineCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
