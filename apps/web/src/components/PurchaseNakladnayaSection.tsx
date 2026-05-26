import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiPostJson } from "../api/fetch-api.js";
import type { CreatePurchaseDocumentResponse, ProductGradeJson } from "../api/types.js";
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
import { kopecksToRubLabel } from "../format/money.js";
import { randomUuid } from "../lib/random-uuid.js";
import { canManageInventoryCatalog } from "../auth/role-panels.js";
import { readPreferredWarehouseId, writePreferredWarehouseId } from "../preferences/ops-preferred-warehouse.js";
import { productGradesFullListQueryOptions, warehousesFullListQueryOptions } from "../query/core-list-queries.js";
import { refreshPurchaseAndBatchLists } from "../query/domain-list-refresh.js";
import { adminRoutes, login } from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert, InfoAlert, WarningAlert } from "../ui/ErrorAlerts.js";
import {
  btnStyle,
  dateFieldStyle,
  fieldStyle,
  successText,
  thHeadDense,
  thtdDense,
} from "../ui/styles.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";

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
  const { meta, user } = useAuth();
  const canManageCatalog = user ? canManageInventoryCatalog(user) : false;
  const queryClient = useQueryClient();
  const enabled = meta?.purchaseDocumentsApi === "enabled";

  const warehousesQ = useQuery({ ...warehousesFullListQueryOptions(), enabled });
  const gradesQ = useQuery({ ...productGradesFullListQueryOptions(), enabled });

  const [docDate, setDocDate] = useState(todayIsoDate);
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [buyerLabel, setBuyerLabel] = useState("");
  const [extraCostKopecks, setExtraCostKopecks] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
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
    const pref = readPreferredWarehouseId();
    const ids = (warehousesQ.data?.warehouses ?? []).map((w) => w.id);
    if (pref && ids.includes(pref)) {
      setWarehouseId(pref);
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
      <section className="birzha-panel" aria-labelledby="nakl-disabled" role="region" aria-label="Закупка товара">
        <BirzhaDisclosure
          defaultOpen
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
    <section className="birzha-panel" aria-labelledby="nakl-heading" role="region" aria-label="Закупка товара">
      <BirzhaDisclosure
        defaultOpen
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
      <div style={{ display: "grid", gap: "0.5rem", width: "100%", maxWidth: "100%", marginBottom: "0.75rem" }}>
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
        <label className="birzha-form-label">
          Дата *
          <BirzhaDateField
            value={docDate}
            onChange={setDocDate}
            style={dateFieldStyle}
            className="birzha-input-date"
            aria-label="Дата документа"
          />
        </label>
        <label className="birzha-form-label">
          Склад *
          <select
            value={warehouseId}
            onChange={(e) => {
              const v = e.target.value;
              setWarehouseId(v);
              writePreferredWarehouseId(v === "" ? null : v);
            }}
            style={{ ...fieldStyle, maxWidth: "100%" }}
          >
            <option value="">— выберите —</option>
            {(warehousesQ.data?.warehouses ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
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
      <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-nakl-lines-card">
        <table className="birzha-nakl-lines-table">
          <thead>
            <tr>
              <th className="birzha-nakl-lines-table__grade" style={thHeadDense}>Товар / калибр</th>
              <th style={thHeadDense}>Кг</th>
              <th style={thHeadDense}>Короба</th>
              <th style={thHeadDense}>Цена</th>
              <th
                style={thHeadDense}
                title="Сумма строки в ₽: «руб,коп» (например 16470,00) или целое число — копейки без запятой"
              >
                Сумма, ₽
              </th>
              <th className="birzha-nakl-lines-table__actions" style={thHeadDense} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td style={thtdDense}>
                  <select
                    value={line.productGradeId}
                    onChange={(e) => updateLine(line.key, { productGradeId: e.target.value })}
                    className="birzha-nakl-line-field"
                    style={{ ...fieldStyle, minWidth: 180, fontSize: "0.82rem" }}
                    disabled={gradesQ.isPending}
                  >
                    <option value="">{gradesQ.isPending ? "Загрузка…" : "— выберите —"}</option>
                    {gradeOptionGroups.map((grp) => (
                      <optgroup key={grp.key} label={grp.label}>
                        {grp.grades.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.code} — {g.displayName}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td style={thtdDense}>
                  <input
                    value={line.totalKg}
                    onChange={(e) => updateLine(line.key, { totalKg: e.target.value })}
                    className="birzha-nakl-line-field"
                    style={{ ...fieldStyle, width: 78 }}
                    inputMode="decimal"
                  />
                </td>
                <td style={thtdDense}>
                  <input
                    value={line.packageCount}
                    onChange={(e) => updateLine(line.key, { packageCount: e.target.value })}
                    className="birzha-nakl-line-field"
                    style={{ ...fieldStyle, width: 72 }}
                    inputMode="decimal"
                    autoComplete="off"
                    title="Короба, целое; можно 10,5 (округлит)"
                  />
                </td>
                <td style={thtdDense}>
                  <input
                    value={line.pricePerKg}
                    onChange={(e) => updateLine(line.key, { pricePerKg: e.target.value })}
                    className="birzha-nakl-line-field"
                    style={{ ...fieldStyle, width: 78 }}
                    inputMode="decimal"
                  />
                </td>
                <td style={thtdDense}>
                  <input
                    value={line.lineTotalKopecks}
                    onChange={(e) => updateLine(line.key, { lineTotalKopecks: e.target.value })}
                    className="birzha-nakl-line-field"
                    style={{ ...fieldStyle, maxWidth: 110 }}
                    inputMode="decimal"
                    autoComplete="off"
                    title="«руб,коп» или целое — копейки; кнопка «Рассчитать» подставит ₽ по кг × цена"
                  />
                </td>
                <td style={thtdDense} className="birzha-nakl-lines-table__actions-cell">
                  <div className="birzha-nakl-line-actions">
                    <button
                      type="button"
                      className="birzha-nakl-line-action birzha-nakl-line-action--calc"
                      onClick={() => fillLineKopecks(line.key)}
                    >
                      Рассчитать
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
                style={{ ...thtdDense, textAlign: "right" }}
                title="Складываются все строки при вводе"
              >
                Итого
              </th>
              <td
                className="birzha-nakl-lines-table__total-cell"
                style={{ ...thtdDense, fontWeight: 600 }}
                title="Сумма кг по строкам, где кг &gt; 0"
              >
                {totalKgLabel}{" "}
                <span className="birzha-text-muted birzha-text-muted--xs">
                  кг
                </span>
              </td>
              <td
                className="birzha-nakl-lines-table__total-cell"
                style={{ ...thtdDense, fontWeight: 600 }}
                title="Сумма коробов; пустое поле = 0"
              >
                {new Intl.NumberFormat("ru-RU", { useGrouping: true, maximumFractionDigits: 0 }).format(
                  nakladnayaFormTotals.totalPackages,
                )}{" "}
                <span className="birzha-text-muted birzha-text-muted--xs">
                  кор.
                </span>
              </td>
              <td className="birzha-text-muted birzha-nakl-lines-table__total-cell" style={thtdDense}>
                —
              </td>
              <td
                colSpan={1}
                className="birzha-nakl-lines-table__total-sum"
                style={{ ...thtdDense, fontWeight: 600, verticalAlign: "middle" }}
              >
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
              <td
                className="birzha-text-subtle"
                style={{ ...thtdDense, fontSize: "0.75rem" }}
              />
            </tr>
          </tfoot>
        </table>
      </div>
      <p style={{ margin: "0.5rem 0" }}>
        <button type="button" style={btnStyle} onClick={addLine}>
          Добавить строку
        </button>
        <button
          type="button"
          style={{ ...btnStyle, marginLeft: 8 }}
          onClick={() => void submit.mutate()}
          disabled={submit.isPending}
        >
          {submit.isPending ? "Отправка…" : "Создать накладную"}
        </button>
      </p>

      {formError ? <ErrorAlert message={formError} title="Создание накладной" /> : null}
      {lastOk && <p style={successText}>{lastOk}</p>}
      </BirzhaDisclosure>
    </section>
  );
}
