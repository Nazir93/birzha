import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

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
import { formatPurchaseDocDateRu } from "../format/purchase-doc-date.js";
import { kopecksToRubLabel } from "../format/money.js";
import { randomUuid } from "../lib/random-uuid.js";
import { canManageInventoryCatalog } from "../auth/role-panels.js";
import { readPreferredWarehouseId, writePreferredWarehouseId } from "../preferences/ops-preferred-warehouse.js";
import {
  productGradesFullListQueryOptions,
  purchaseDocumentsFullListQueryOptions,
  queryRoots,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import { adminAwarePathForPath, adminRoutes, login, ops, purchaseNakladnayaDocumentPathForPath } from "../routes.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";
import {
  btnStyle,
  dateFieldStyle,
  errorText,
  fieldStyle,
  muted,
  successText,
  thHeadDense,
  thtdDense,
  warnText,
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
  const { pathname } = useLocation();
  const { meta, user } = useAuth();
  const distributionPath = adminAwarePathForPath(pathname, adminRoutes.distribution, ops.distribution);
  const operationsPath = adminAwarePathForPath(pathname, adminRoutes.operations, ops.operations);
  const canManageCatalog = user ? canManageInventoryCatalog(user) : false;
  const queryClient = useQueryClient();
  const enabled = meta?.purchaseDocumentsApi === "enabled";

  const warehousesQ = useQuery({ ...warehousesFullListQueryOptions(), enabled });
  const gradesQ = useQuery({ ...productGradesFullListQueryOptions(), enabled });

  const listQ = useQuery({ ...purchaseDocumentsFullListQueryOptions(), enabled });

  const [documentId, setDocumentId] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [docDate, setDocDate] = useState(todayIsoDate);
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [buyerLabel, setBuyerLabel] = useState("");
  const [extraCostKopecks, setExtraCostKopecks] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
    void queryClient.invalidateQueries({ queryKey: queryRoots.purchaseDocuments });
  }, [queryClient]);

  const submit = useMutation({
    mutationFn: async () => {
      setFormError(null);
      setLastOk(null);
      const body = parseCreatePurchaseDocumentForm({
        documentId,
        documentNumber,
        docDate,
        warehouseId,
        supplierName,
        buyerLabel,
        extraCostKopecks,
        lines,
      });
      return apiPostJson("/api/purchase-documents", body) as Promise<CreatePurchaseDocumentResponse>;
    },
    onSuccess: (data) => {
      setLastOk(`Создан документ: ${data.documentId}. Форма очищена — можно ввести новую накладную.`);
      setFormError(null);
      setDocumentId("");
      setDocumentNumber("");
      setDocDate(todayIsoDate());
      setWarehouseId("");
      setSupplierName("");
      setBuyerLabel("");
      setExtraCostKopecks("0");
      setLines([emptyLine()]);
      invalidate();
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
        <h3 id="nakl-disabled" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          Закупка товара
        </h3>
        <p style={muted}>
          Раздел накладных временно недоступен. Проверьте подключение к серверу или обратитесь к администратору.
        </p>
      </section>
    );
  }

  return (
    <section className="birzha-panel" aria-labelledby="nakl-heading" role="region" aria-label="Закупка товара">
      <div className="birzha-section-heading">
        <div>
          <p className="birzha-section-heading__eyebrow">Приёмка</p>
          <h3 id="nakl-heading" className="birzha-section-title birzha-section-title--sm">
            Закупка товара
          </h3>
        </div>
        <p className="birzha-section-heading__note">
          После сохранения партии появятся в{" "}
          <Link to={distributionPath} style={{ fontWeight: 600 }}>
            распределении
          </Link>{" "}
          и{" "}
          <Link to={operationsPath} style={{ fontWeight: 600 }}>
            операциях
          </Link>
        </p>
      </div>

      {catalogLoadErrorText && <p style={warnText}>{catalogLoadErrorText}</p>}
      {catalogsEmptyOk && canManageCatalog && (
        <p role="status" style={warnText}>
          В справочнике нет складов или калибров — нечего выбирать в списках. Добавьте их в разделе{" "}
          <strong>Склады и калибры</strong> (кабинет админа) или попросите администратора проверить начальные справочники.
        </p>
      )}
      {catalogsEmptyOk && !canManageCatalog && (
        <p role="status" style={warnText}>
          В справочнике нет складов или калибров — обратитесь к администратору, чтобы настроить справочники в кабинете{" "}
          <strong>админа</strong> (склады и калибры), либо попросите применить миграции на сервере.
        </p>
      )}
      {(warehousesQ.isPending || gradesQ.isPending) && (
        <p style={muted} role="status" aria-live="polite">
          <LoadingIndicator size="md" label="Загрузка справочников складов и калибров…" />
        </p>
      )}
      {listQ.isError && (
        <p role="alert" style={errorText}>
          Список накладных не загрузился: {listQ.error instanceof Error ? listQ.error.message : String(listQ.error)}
        </p>
      )}

      <div style={{ display: "grid", gap: "0.5rem", width: "100%", maxWidth: "100%", marginBottom: "0.75rem" }}>
        <label style={{ fontSize: "0.88rem" }}>
          Номер документа *
          <input
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            style={fieldStyle}
            placeholder="НФ-100"
            autoComplete="off"
          />
        </label>
        <label style={{ fontSize: "0.88rem" }}>
          Дата *
          <BirzhaDateField
            value={docDate}
            onChange={setDocDate}
            style={dateFieldStyle}
            className="birzha-input-date"
            aria-label="Дата документа"
          />
        </label>
        <label style={{ fontSize: "0.88rem" }}>
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
        {canManageCatalog && warehouseCount > 0 && (
          <p style={{ ...muted, fontSize: "0.85rem", margin: 0 }}>
            Нет нужного склада — добавьте его в{" "}
            <Link to={adminRoutes.inventory} style={{ fontWeight: 600 }}>
              кабинете админа
            </Link>{" "}
            (склады), затем обновите список или страницу.
          </p>
        )}
        <label style={{ fontSize: "0.88rem" }}>
          Идентификатор документа (опционально)
          <input value={documentId} onChange={(e) => setDocumentId(e.target.value)} style={fieldStyle} placeholder="" />
        </label>
        <label style={{ fontSize: "0.88rem" }}>
          Поставщик (опц.)
          <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} style={fieldStyle} />
        </label>
        <label style={{ fontSize: "0.88rem" }}>
          Покупатель / подпись (опц.)
          <input value={buyerLabel} onChange={(e) => setBuyerLabel(e.target.value)} style={fieldStyle} />
        </label>
        <label style={{ fontSize: "0.88rem" }}>
          Доп. расходы (коп. или 100,50 = руб+коп)
          <input value={extraCostKopecks} onChange={(e) => setExtraCostKopecks(e.target.value)} style={fieldStyle} />
        </label>
      </div>

      <div style={{ margin: "0 0 0.35rem" }}>
        <p style={{ ...muted, margin: 0 }}>Строки</p>
        <p style={{ ...muted, margin: "0.25rem 0 0", fontSize: "0.82rem" }}>
          <strong>Кг</strong> и <strong>₽/кг</strong> — <strong>целые</strong> или <strong>дробные</strong> (запятая или
          точка, например 10,5). <strong>Короба</strong> — целое; можно ввести с «,5» (округлится), пробелы игнорируются.
        </p>
      </div>
      {!gradesQ.isPending && gradeCount === 0 && !gradesQ.isError && canManageCatalog && (
        <p role="status" style={warnText}>
          В справочнике нет калибров. Добавьте калибры в{" "}
          <Link to={adminRoutes.inventory} style={{ fontWeight: 600 }}>
            кабинете админа — «Склады и калибры»
          </Link>
          , обновите страницу.
        </p>
      )}
      {!gradesQ.isPending && gradeCount === 0 && !gradesQ.isError && !canManageCatalog && (
        <p role="status" style={warnText}>
          В справочнике нет калибров — пусть администратор добавит их в разделе «Склады и калибры».
        </p>
      )}
      {canManageCatalog && gradeCount > 0 && (
        <p style={{ ...muted, fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
          Нет нужного калибра в списке —{" "}
          <Link to={adminRoutes.inventory} style={{ fontWeight: 600 }}>
            добавьте в админке
          </Link>
          , затем обновите страницу.
        </p>
      )}
      <div className="birzha-table-scroll">
        <table style={{ borderCollapse: "collapse", fontSize: "0.85rem", minWidth: 780, width: "100%" }}>
          <thead>
            <tr>
              <th style={thHeadDense}>Товар / калибр</th>
              <th style={thHeadDense}>Кг</th>
              <th style={thHeadDense}>Короба</th>
              <th style={thHeadDense}>₽/кг</th>
              <th style={thHeadDense} title="Только цифры = коп.; запятая = «руб,коп»">
                Сумма, коп. (или руб,коп)
              </th>
              <th style={thHeadDense} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td style={thtdDense}>
                  <select
                    value={line.productGradeId}
                    onChange={(e) => updateLine(line.key, { productGradeId: e.target.value })}
                    style={{ ...fieldStyle, minWidth: 160, fontSize: "0.82rem" }}
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
                    style={{ ...fieldStyle, width: 72 }}
                    inputMode="decimal"
                  />
                </td>
                <td style={thtdDense}>
                  <input
                    value={line.packageCount}
                    onChange={(e) => updateLine(line.key, { packageCount: e.target.value })}
                    style={{ ...fieldStyle, width: 56 }}
                    inputMode="decimal"
                    autoComplete="off"
                    title="Короба, целое; можно 10,5 (округлит)"
                  />
                </td>
                <td style={thtdDense}>
                  <input
                    value={line.pricePerKg}
                    onChange={(e) => updateLine(line.key, { pricePerKg: e.target.value })}
                    style={{ ...fieldStyle, width: 72 }}
                    inputMode="decimal"
                  />
                </td>
                <td style={thtdDense}>
                  <input
                    value={line.lineTotalKopecks}
                    onChange={(e) => updateLine(line.key, { lineTotalKopecks: e.target.value })}
                    style={{ ...fieldStyle, maxWidth: 100 }}
                    inputMode="decimal"
                    autoComplete="off"
                    title="50000 = коп.; 32232,77 = 32 232,77 RUB = 3 223 277 коп."
                  />
                </td>
                <td style={thtdDense}>
                  <button type="button" style={{ ...btnStyle, fontSize: "0.78rem" }} onClick={() => fillLineKopecks(line.key)}>
                    =кг×цена
                  </button>
                  <button
                    type="button"
                    style={{ ...btnStyle, fontSize: "0.78rem", marginLeft: 4 }}
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length <= 1}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope="row"
                style={{ ...thtdDense, textAlign: "right", background: "rgba(0,0,0,0.03)" }}
                title="Складываются все строки при вводе"
              >
                Итого
              </th>
              <td
                style={{ ...thtdDense, fontWeight: 600, background: "rgba(0,0,0,0.03)" }}
                title="Сумма кг по строкам, где кг &gt; 0"
              >
                {totalKgLabel}{" "}
                <span className="birzha-text-muted" style={{ fontWeight: 400, fontSize: "0.78rem" }}>
                  кг
                </span>
              </td>
              <td
                style={{ ...thtdDense, fontWeight: 600, background: "rgba(0,0,0,0.03)" }}
                title="Сумма коробов; пустое поле = 0"
              >
                {new Intl.NumberFormat("ru-RU", { useGrouping: true, maximumFractionDigits: 0 }).format(
                  nakladnayaFormTotals.totalPackages,
                )}{" "}
                <span className="birzha-text-muted" style={{ fontWeight: 400, fontSize: "0.78rem" }}>
                  кор.
                </span>
              </td>
              <td className="birzha-text-muted" style={{ ...thtdDense, background: "rgba(0,0,0,0.04)" }}>
                —
              </td>
              <td
                colSpan={1}
                style={{ ...thtdDense, fontWeight: 600, background: "rgba(0,0,0,0.03)", verticalAlign: "top" }}
              >
                <div>По строкам: {nakladnayaFormTotals.totalLineKopecks} коп.</div>
                <div className="birzha-text-subtle" style={{ fontSize: "0.82rem" }}>
                  = {kopecksToRubLabel(nakladnayaFormTotals.totalLineKopecks.toString())} ₽
                </div>
                {extraCostKopecksForTotals > 0 && (
                  <div style={{ fontSize: "0.8rem", marginTop: 6, fontWeight: 600, color: "var(--color-text)" }}>
                    Всего (строки + доп.): {nakladnayaFormTotals.totalAllKopecks} коп. ={" "}
                    {kopecksToRubLabel(nakladnayaFormTotals.totalAllKopecks.toString())} ₽
                    <div className="birzha-text-subtle" style={{ fontSize: "0.76rem", fontWeight: 400, marginTop: 2 }}>
                      (доп. расходы: {extraCostKopecksForTotals} коп.)
                    </div>
                  </div>
                )}
              </td>
              <td
                className="birzha-text-subtle"
                style={{ ...thtdDense, background: "rgba(0,0,0,0.03)", fontSize: "0.75rem" }}
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

      {formError && (
        <p role="alert" style={errorText}>
          {formError}
        </p>
      )}
      {lastOk && <p style={successText}>{lastOk}</p>}

      {listQ.isPending && <LoadingBlock label="Загрузка списка накладных…" minHeight={80} />}

      {listQ.isFetching && !listQ.isPending && (
        <p style={{ margin: "0.35rem 0" }} role="status" aria-live="polite">
          <LoadingIndicator size="sm" label="Обновление списка накладных…" />
        </p>
      )}

      {listQ.data && listQ.data.purchaseDocuments.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <p style={{ ...muted, marginBottom: "0.35rem" }}>
            Сохранённые накладные — нажмите на <strong>номер</strong>, чтобы открыть документ со всеми строками и партиями.
          </p>
          <div className="birzha-table-scroll">
            <table style={{ borderCollapse: "collapse", fontSize: "0.82rem", minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={thHeadDense}>Номер</th>
                  <th style={thHeadDense}>Дата</th>
                  <th style={thHeadDense}>Склад</th>
                  <th style={thHeadDense}>Строк</th>
                </tr>
              </thead>
              <tbody>
                {listQ.data.purchaseDocuments.slice(0, 50).map((d) => {
                  const wh = warehousesQ.data?.warehouses.find((w) => w.id === d.warehouseId);
                  return (
                    <tr key={d.id}>
                      <td style={thtdDense}>
                        <Link to={purchaseNakladnayaDocumentPathForPath(pathname, d.id)} style={{ fontWeight: 600 }}>
                          {d.documentNumber}
                        </Link>
                      </td>
                      <td style={{ ...thtdDense, fontWeight: 600 }}>{formatPurchaseDocDateRu(d.docDate)}</td>
                      <td style={thtdDense}>
                        {wh ? (
                          <>
                            {wh.name} <span className="birzha-text-muted">({wh.code})</span>
                          </>
                        ) : (
                          <code style={{ fontSize: "0.75rem" }}>{d.warehouseId}</code>
                        )}
                      </td>
                      <td style={thtdDense}>{d.lineCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
