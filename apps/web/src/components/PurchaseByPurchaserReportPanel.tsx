import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { purchaseByPurchaserReportQueryOptions } from "../query/core-list-queries.js";
import { formatYmd } from "./BirzhaCalendarFields.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { kopecksToRubDisplay } from "../format/money.js";
import { fieldStyle } from "../ui/styles.js";

function defaultMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = formatYmd(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = formatYmd(last.getFullYear(), last.getMonth(), last.getDate());
  return { from, to };
}

function kgLabel(kg: number): string {
  return kg.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

/**
 * Отчёт «закупщик × склад» за период по дате накладной.
 * Доступ: admin (`/a`) и manager (`/o`) — см. `purchaseByPurchaser` в role-panels.
 */
export function PurchaseByPurchaserReportPanel() {
  const initial = useMemo(() => defaultMonthRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [applied, setApplied] = useState(initial);

  const q = useQuery({
    ...purchaseByPurchaserReportQueryOptions(applied.from, applied.to),
  });

  const report = q.data;

  return (
    <section className="birzha-section-shell" aria-labelledby="purchase-by-purchaser-h">
      <header className="birzha-section-hero" style={{ marginBottom: "1rem" }}>
        <h2 id="purchase-by-purchaser-h" className="birzha-home-hero__title">
          Закупки по закупщикам
        </h2>
        <p className="birzha-ui-sm birzha-section-note" style={{ maxWidth: "40rem" }}>
          Сколько каждый закупщик занёс на склад: сумма ₽, кг и ящики. Период — по дате
          закупочной накладной. Итоги — по закупщику и по складу.
        </p>
      </header>

      <form
        className="birzha-toolbar no-print"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ from, to });
        }}
      >
        <label className="birzha-ui-sm">
          С
          <div style={{ marginTop: "0.25rem" }}>
            <BirzhaDateField aria-label="Дата с" value={from} onChange={setFrom} style={fieldStyle} />
          </div>
        </label>
        <label className="birzha-ui-sm">
          По
          <div style={{ marginTop: "0.25rem" }}>
            <BirzhaDateField aria-label="Дата по" value={to} onChange={setTo} style={fieldStyle} />
          </div>
        </label>
        <button type="submit" className="birzha-btn birzha-btn--primary">
          Показать
        </button>
      </form>

      {q.isError ? (
        <p className="birzha-error" role="alert">
          Не удалось загрузить отчёт. Нужны права admin или manager.
        </p>
      ) : null}
      {q.isFetching && !report ? <p className="birzha-ui-sm">Загрузка…</p> : null}

      {report ? (
        <>
          <p className="birzha-ui-sm" style={{ marginBottom: "0.75rem" }}>
            Период {report.from} — {report.to}. Накладных: {report.grand.documentCount}. Итого:{" "}
            <strong>{kopecksToRubDisplay(report.grand.totalKopecks)} ₽</strong>,{" "}
            <strong>{kgLabel(report.grand.totalKg)} кг</strong>,{" "}
            <strong>{report.grand.packageCount} ящ.</strong>
          </p>

          <h3 className="birzha-ui-md" style={{ marginTop: "1.25rem" }}>
            Закупщик × склад
          </h3>
          <div className="birzha-table-wrap">
            <table className="birzha-table">
              <thead>
                <tr>
                  <th>Закупщик</th>
                  <th>Склад</th>
                  <th>Накл.</th>
                  <th>Кг</th>
                  <th>Ящ.</th>
                  <th>Сумма, ₽</th>
                </tr>
              </thead>
              <tbody>
                {report.cells.length === 0 ? (
                  <tr>
                    <td colSpan={6}>Нет накладных за период</td>
                  </tr>
                ) : (
                  report.cells.map((c) => (
                    <tr key={`${c.purchaserUserId ?? "none"}-${c.warehouseId}`}>
                      <td>{c.purchaserLogin}</td>
                      <td>{c.warehouseName}</td>
                      <td>{c.documentCount}</td>
                      <td>{kgLabel(c.totalKg)}</td>
                      <td>{c.packageCount}</td>
                      <td>{kopecksToRubDisplay(c.totalKopecks)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h3 className="birzha-ui-md" style={{ marginTop: "1.5rem" }}>
            Итого по закупщикам
          </h3>
          <div className="birzha-table-wrap">
            <table className="birzha-table">
              <thead>
                <tr>
                  <th>Закупщик</th>
                  <th>Накл.</th>
                  <th>Кг</th>
                  <th>Ящ.</th>
                  <th>Сумма, ₽</th>
                </tr>
              </thead>
              <tbody>
                {report.byPurchaser.map((p) => (
                  <tr key={p.purchaserUserId ?? "none"}>
                    <td>{p.purchaserLogin}</td>
                    <td>{p.documentCount}</td>
                    <td>{kgLabel(p.totalKg)}</td>
                    <td>{p.packageCount}</td>
                    <td>{kopecksToRubDisplay(p.totalKopecks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="birzha-ui-md" style={{ marginTop: "1.5rem" }}>
            Итого по складам
          </h3>
          <div className="birzha-table-wrap">
            <table className="birzha-table">
              <thead>
                <tr>
                  <th>Склад</th>
                  <th>Накл.</th>
                  <th>Кг</th>
                  <th>Ящ.</th>
                  <th>Сумма, ₽</th>
                </tr>
              </thead>
              <tbody>
                {report.byWarehouse.map((w) => (
                  <tr key={w.warehouseId}>
                    <td>{w.warehouseName}</td>
                    <td>{w.documentCount}</td>
                    <td>{kgLabel(w.totalKg)}</td>
                    <td>{w.packageCount}</td>
                    <td>{kopecksToRubDisplay(w.totalKopecks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
