import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { canAccessCabinet } from "../auth/role-panels.js";
import { accountingPathWithPeriod } from "../format/accounting-period.js";
import { kpiToneForSignedKopecks } from "../format/kpi-tone.js";
import { kopecksToRubDisplay } from "../format/money.js";
import { tripReportHref } from "../format/trip-report-href.js";
import { accounting, adminRoutes } from "../routes.js";
import { BirzhaDateField, formatYmd } from "./BirzhaCalendarFields.js";
import { AccountingStockBalances } from "./AccountingStockBalances.js";
import { DailySeriesChart } from "./dashboard/DailySeriesChart.js";
import {
  DashboardSummaryPeriodToggles,
  dashboardPeriodStartDate,
  type DashboardSummaryPeriod,
} from "./dashboard/dashboard-summary-ui.js";
import {
  shipDestinationsFullListQueryOptions,
  tripsPickerQueryOptions,
} from "../query/core-list-queries.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert } from "../ui/ErrorAlerts.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { dateFieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

type PeriodSummarySlice = {
  from: string;
  to: string;
  revenueTotalKopecks: string;
  revenueCashKopecks: string;
  revenueCardKopecks: string;
  revenueDebtKopecks: string;
  debtPaidKopecks: string;
  costOfSoldKopecks: string;
  costOfShortageKopecks: string;
  grossProfitKopecks: string;
  expensesKopecks: string;
  tripExpensesKopecks?: string;
  sellerFieldExpensesKopecks?: string;
  purchaserExpensesKopecks?: string;
  sellerMoneySendsKopecks?: string;
  sellerRentExpensesKopecks?: string;
  operatingExpensesKopecks?: string;
  netProfitKopecks: string;
  purchaseTotalKopecks: string;
  supplierPaidKopecks: string;
  receivablesOutstandingKopecks: string;
  payablesOutstandingKopecks: string;
};

type TripDetailRow = {
  tripId: string;
  tripNumber: string;
  destinationCode: string | null;
  departedAt: string | null;
  status: string;
  revenueTotalKopecks: string;
  revenueCashKopecks: string;
  revenueCardKopecks: string;
  revenueDebtKopecks: string;
  tripExpensesKopecks: string;
  sellerFieldExpensesKopecks: string;
  sellerRentExpensesKopecks: string;
  debtPaidKopecks: string;
  debtOutstandingKopecks: string;
  grossProfitKopecks: string;
  netProfitKopecks: string;
};

type PeriodSummary = PeriodSummarySlice & {
  destinationCode: string | null;
  tripId: string | null;
  selected: PeriodSummarySlice | null;
  trips: TripDetailRow[];
};

function periodRange(period: DashboardSummaryPeriod): { from: string; to: string } {
  const now = new Date();
  const to = formatYmd(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "all") {
    return { from: "2020-01-01", to };
  }
  const start = dashboardPeriodStartDate(period);
  if (!start) {
    return { from: to, to };
  }
  return {
    from: formatYmd(start.getFullYear(), start.getMonth(), start.getDate()),
    to,
  };
}

function KpiLink({
  to,
  extraClass,
  children,
}: {
  to: string;
  extraClass?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`birzha-kpi-tile birzha-kpi-tile--premium birzha-kpi-tile--link${extraClass ? ` ${extraClass}` : ""}`}
    >
      {children}
    </Link>
  );
}

function KpiTile({
  extraClass,
  children,
}: {
  extraClass?: string;
  children: ReactNode;
}) {
  return (
    <div className={`birzha-kpi-tile birzha-kpi-tile--premium${extraClass ? ` ${extraClass}` : ""}`}>{children}</div>
  );
}

function money(v: string): string {
  return `${kopecksToRubDisplay(v)} ₽`;
}

function OverallKpis({ s, href }: { s: PeriodSummarySlice; href: (path: string) => string }) {
  const tripExp = s.tripExpensesKopecks ?? s.expensesKopecks ?? "0";
  const sellerExp = s.sellerFieldExpensesKopecks ?? "0";
  const rentExp = s.sellerRentExpensesKopecks ?? "0";
  const purchaserExp = s.purchaserExpensesKopecks ?? "0";
  const sellerSends = s.sellerMoneySendsKopecks ?? "0";
  const operating = s.operatingExpensesKopecks ?? tripExp;

  return (
    <>
      <section className="birzha-kpi-grid birzha-admin-dash-modern__kpi" aria-label="Деньги с продаж и долги">
        <KpiLink to={href(accounting.sales)} extraClass="birzha-kpi-tile--tone-good">
          <div className="birzha-kpi-tile__label">С продаж</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(s.revenueTotalKopecks)}</div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">
            нал {money(s.revenueCashKopecks)} · карта {money(s.revenueCardKopecks)}
          </div>
        </KpiLink>
        <KpiLink to={href(accounting.payables)} extraClass="birzha-kpi-tile--tone-bad">
          <div className="birzha-kpi-tile__label">Закуп тепличников</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(s.purchaseTotalKopecks)}</div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">отдали {money(s.supplierPaidKopecks)}</div>
        </KpiLink>
        <KpiLink to={href(accounting.payables)} extraClass="birzha-kpi-tile--tone-warn">
          <div className="birzha-kpi-tile__label">Должны тепличникам</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(s.payablesOutstandingKopecks)}</div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">выдать по накладным</div>
        </KpiLink>
        <KpiLink to={href(accounting.receivables)} extraClass="birzha-kpi-tile--tone-warn">
          <div className="birzha-kpi-tile__label">Долги клиентов</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
            {money(s.receivablesOutstandingKopecks)}
          </div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">погашено {money(s.debtPaidKopecks)}</div>
        </KpiLink>
      </section>

      <section className="birzha-kpi-grid birzha-admin-dash-modern__kpi" aria-label="Расходы и прибыль">
        <KpiLink to={href(accounting.purchaserExpenses)} extraClass="birzha-kpi-tile--tone-bad">
          <div className="birzha-kpi-tile__label">Расходы закупщиков</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(purchaserExp)}</div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">зарплата и прочее</div>
        </KpiLink>
        <KpiLink to={href(accounting.sellerExpenses)} extraClass="birzha-kpi-tile--tone-bad">
          <div className="birzha-kpi-tile__label">Расходы продавцов</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(sellerExp)}</div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">грузчик, обед, палеты</div>
        </KpiLink>
        <KpiLink to={href(accounting.rent)} extraClass="birzha-kpi-tile--tone-bad">
          <div className="birzha-kpi-tile__label">Аренда / бронь</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(rentExp)}</div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">отдельно от полевых</div>
        </KpiLink>
        <KpiLink to={href(accounting.sellerSends)} extraClass="birzha-kpi-tile--tone-warn">
          <div className="birzha-kpi-tile__label">Отправки продавцов</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(sellerSends)}</div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">кому / сколько / дата</div>
        </KpiLink>
      </section>

      <section className="birzha-kpi-grid birzha-admin-dash-modern__kpi birzha-admin-dash-modern__kpi--pair" aria-label="Рейс и прибыль">
        <KpiLink to={href(accounting.tripExpenses)} extraClass="birzha-kpi-tile--tone-bad">
          <div className="birzha-kpi-tile__label">Расходы по рейсу</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(tripExp)}</div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">топливо, дорога, водитель</div>
        </KpiLink>
        <KpiLink to={href(accounting.profit)} extraClass={kpiToneForSignedKopecks(s.netProfitKopecks)}>
          <div className="birzha-kpi-tile__label">Валовая / чистая</div>
          <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
            {money(s.grossProfitKopecks)} / {money(s.netProfitKopecks)}
          </div>
          <div className="birzha-kpi-tile__hint birzha-ui-sm">
            расходы {money(operating)} · себ. {money(s.costOfSoldKopecks)}
          </div>
        </KpiLink>
      </section>
    </>
  );
}

function SelectedKpis({ s }: { s: PeriodSummarySlice }) {
  const tripExp = s.tripExpensesKopecks ?? s.expensesKopecks ?? "0";
  const sellerExp = s.sellerFieldExpensesKopecks ?? "0";
  const rentExp = s.sellerRentExpensesKopecks ?? "0";
  const sellerSends = s.sellerMoneySendsKopecks ?? "0";
  const operating = s.operatingExpensesKopecks ?? tripExp;

  return (
    <section className="birzha-kpi-grid birzha-admin-dash-modern__kpi" aria-label="Сводка по выборке">
      <KpiTile extraClass="birzha-kpi-tile--tone-good">
        <div className="birzha-kpi-tile__label">С продаж</div>
        <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(s.revenueTotalKopecks)}</div>
        <div className="birzha-kpi-tile__hint birzha-ui-sm">
          нал {money(s.revenueCashKopecks)} · карта {money(s.revenueCardKopecks)} · долг {money(s.revenueDebtKopecks)}
        </div>
      </KpiTile>
      <KpiTile extraClass="birzha-kpi-tile--tone-warn">
        <div className="birzha-kpi-tile__label">Долги клиентов</div>
        <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(s.receivablesOutstandingKopecks)}</div>
        <div className="birzha-kpi-tile__hint birzha-ui-sm">погашено {money(s.debtPaidKopecks)}</div>
      </KpiTile>
      <KpiTile extraClass="birzha-kpi-tile--tone-bad">
        <div className="birzha-kpi-tile__label">Расходы продавцов</div>
        <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">{money(sellerExp)}</div>
        <div className="birzha-kpi-tile__hint birzha-ui-sm">аренда {money(rentExp)} · отправки {money(sellerSends)}</div>
      </KpiTile>
      <KpiTile extraClass={kpiToneForSignedKopecks(s.netProfitKopecks)}>
        <div className="birzha-kpi-tile__label">Рейс / прибыль</div>
        <div className="birzha-kpi-tile__value birzha-kpi-tile__value--md">
          {money(s.grossProfitKopecks)} / {money(s.netProfitKopecks)}
        </div>
        <div className="birzha-kpi-tile__hint birzha-ui-sm">
          расходы рейса {money(tripExp)} · опер. {money(operating)}
        </div>
      </KpiTile>
    </section>
  );
}

/**
 * Сводка бухгалтера: общее за период + выборка региона/рейса с детализацией.
 */
export function AccountingCabinetHome() {
  const { user, meta } = useAuth();
  const canGoToAdminPanel = user ? canAccessCabinet(user, "admin") : false;
  const shipDestEnabled = meta?.shipDestinationsApi === "enabled";
  const [period, setPeriod] = useState<DashboardSummaryPeriod>("30d");
  const defaults = useMemo(() => periodRange("30d"), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [destinationCode, setDestinationCode] = useState("");
  const [tripId, setTripId] = useState("");

  const onPeriodChange = (next: DashboardSummaryPeriod) => {
    setPeriod(next);
    const range = periodRange(next);
    setFrom(range.from);
    setTo(range.to);
  };

  const destQ = useQuery({
    ...shipDestinationsFullListQueryOptions(),
    enabled: shipDestEnabled,
  });

  const tripsQ = useQuery(
    tripsPickerQueryOptions({
      limit: 500,
      offset: 0,
      order: "departedAtDesc",
    }),
  );

  const destOptions = useMemo(() => {
    const rows = (destQ.data?.shipDestinations ?? []).filter((d) => d.isActive);
    return [
      { value: "", label: "Все регионы" },
      ...rows.map((d) => ({ value: d.code, label: d.displayName?.trim() || d.code })),
    ];
  }, [destQ.data]);

  const destNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of destQ.data?.shipDestinations ?? []) {
      m.set(d.code, d.displayName?.trim() || d.code);
    }
    return m;
  }, [destQ.data]);

  const tripOptions = useMemo(() => {
    const dest = destinationCode.trim();
    const rows = (tripsQ.data?.trips ?? []).filter((t) => {
      if (!dest) {
        return true;
      }
      return (t.destinationCode ?? "").trim() === dest;
    });
    return [
      { value: "", label: "Все рейсы" },
      ...rows.map((t) => {
        const destLabel =
          t.destinationName?.trim() ||
          (t.destinationCode ? destNameByCode.get(t.destinationCode) : "") ||
          t.destinationCode ||
          "";
        return {
          value: t.id,
          label: destLabel ? `${t.tripNumber} · ${destLabel}` : t.tripNumber,
        };
      }),
    ];
  }, [tripsQ.data, destinationCode, destNameByCode]);

  useEffect(() => {
    if (!tripId) {
      return;
    }
    const stillVisible = tripOptions.some((o) => o.value === tripId);
    if (!stillVisible) {
      setTripId("");
    }
  }, [tripId, tripOptions]);

  const hasScope = Boolean(destinationCode.trim() || tripId.trim());

  const periodQ = useQuery({
    queryKey: ["accounting", "period-summary", from, to, destinationCode, tripId],
    queryFn: async () => {
      const p = new URLSearchParams({ from, to });
      if (destinationCode.trim()) {
        p.set("destinationCode", destinationCode.trim());
      }
      if (tripId.trim()) {
        p.set("tripId", tripId.trim());
      }
      const res = await apiFetch(`/api/accounting/period-summary?${p}`);
      await assertOkResponse(res);
      return (await res.json()) as PeriodSummary;
    },
  });

  const s = periodQ.data;
  const href = (path: string) => accountingPathWithPeriod(path, from, to);
  const selected = s?.selected ?? null;
  const scopeTrips = s?.trips ?? [];

  return (
    <div className="birzha-admin-dash">
      <h2 className="birzha-sr-only">Сводка бухгалтерии</h2>

      <header className="birzha-admin-dash-modern__hero">
        <div>
          <p className="birzha-home-hero__eyebrow">Бухгалтерия</p>
          <h3 className="birzha-admin-dash-modern__title">Сводка</h3>
          <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.35rem 0 0", maxWidth: "40rem" }}>
            Сверху — период, регион и рейс. Ниже всегда общее за период; при выборке — детальная касса по рейсам.
          </p>
        </div>
        <nav className="birzha-admin-dash-modern__actions no-print" aria-label="Быстрые действия">
          <Link to={href(accounting.payables)} className="birzha-home-action">
            <strong>Тепличники</strong>
          </Link>
          <Link to={href(accounting.receivables)} className="birzha-home-action">
            <strong>Долги</strong>
          </Link>
          <Link to={accounting.reports} className="birzha-home-action">
            <strong>Отчёт</strong>
          </Link>
          <Link to={accounting.counterparties} className="birzha-home-action">
            <strong>Контрагенты</strong>
          </Link>
          {canGoToAdminPanel ? (
            <Link to={adminRoutes.home} className="birzha-home-action">
              <strong>Админка</strong>
            </Link>
          ) : null}
        </nav>
      </header>

      <section className="birzha-panel birzha-dash-filters" aria-label="Период и выборка">
        <div>
          <DashboardSummaryPeriodToggles period={period} onChange={onPeriodChange} />
          <div className="birzha-admin-dash-modern__dates">
            <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
              С
              <BirzhaDateField aria-label="Дата с" value={from} onChange={setFrom} style={dateFieldStyle} />
            </label>
            <label className="birzha-form-label" style={{ margin: 0, minWidth: "9rem" }}>
              По
              <BirzhaDateField aria-label="Дата по" value={to} onChange={setTo} style={dateFieldStyle} />
            </label>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.65rem 1rem",
              marginTop: "0.75rem",
              alignItems: "flex-end",
            }}
          >
            <label className="birzha-form-label" style={{ margin: 0, minWidth: "12rem", flex: "1 1 12rem" }}>
              Регион
              <BirzhaSelect
                aria-label="Регион (направление)"
                value={destinationCode}
                onChange={(v) => {
                  setDestinationCode(v);
                  setTripId("");
                }}
                options={
                  shipDestEnabled
                    ? destOptions
                    : [
                        { value: "", label: "Все регионы" },
                        ...[...new Set((tripsQ.data?.trips ?? []).map((t) => t.destinationCode).filter(Boolean))].map(
                          (code) => ({
                            value: code!,
                            label: destNameByCode.get(code!) || code!,
                          }),
                        ),
                      ]
                }
                placeholder="Все регионы"
              />
            </label>
            <label className="birzha-form-label" style={{ margin: 0, minWidth: "14rem", flex: "1 1 14rem" }}>
              Рейс
              <BirzhaSelect
                aria-label="Рейс"
                value={tripId}
                onChange={setTripId}
                options={tripOptions}
                placeholder="Все рейсы"
              />
            </label>
            {hasScope ? (
              <button
                type="button"
                className="birzha-clean-ops-text-btn"
                style={{ marginBottom: "0.15rem" }}
                onClick={() => {
                  setDestinationCode("");
                  setTripId("");
                }}
              >
                Сбросить выборку
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {periodQ.isPending ? <LoadingBlock label="Сводка за период…" minHeight={72} skeleton skeletonRows={3} /> : null}
      {periodQ.isError ? <ErrorAlert error={periodQ.error} title="Сводка за период" /> : null}

      {s && hasScope && selected ? (
        <section style={{ marginBottom: "1.25rem" }} aria-labelledby="acc-scope-h">
          <h3 id="acc-scope-h" style={{ margin: "0 0 0.35rem", fontSize: "1.05rem" }}>
            По выборке
          </h3>
          <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.75rem" }}>
            {destinationCode.trim()
              ? `Регион: ${destNameByCode.get(destinationCode.trim()) || destinationCode.trim()}`
              : "Все регионы"}
            {tripId.trim()
              ? ` · рейс ${scopeTrips.find((t) => t.tripId === tripId)?.tripNumber ?? tripId}`
              : " · все рейсы региона"}
            {" · "}
            {scopeTrips.length} рейс.
          </p>
          <SelectedKpis s={selected} />
          {scopeTrips.length === 0 ? (
            <BirzhaEmptyState compact title="За период нет рейсов по этой выборке" />
          ) : (
            <div className="birzha-table-scroll" style={{ marginTop: "0.85rem" }}>
              <table style={{ ...tableStyle, minWidth: 720 }} aria-label="Рейсы по выборке">
                <thead>
                  <tr>
                    <th style={thHead}>Рейс</th>
                    <th style={thHead}>Регион</th>
                    <th style={{ ...thHead, textAlign: "right" }}>Продажи</th>
                    <th style={{ ...thHead, textAlign: "right" }}>Нал / карта / долг</th>
                    <th style={{ ...thHead, textAlign: "right" }}>Расх. рейса</th>
                    <th style={{ ...thHead, textAlign: "right" }}>Остаток долга</th>
                    <th style={{ ...thHead, textAlign: "right" }}>Чистая</th>
                    <th style={thHead} />
                  </tr>
                </thead>
                <tbody>
                  {scopeTrips.map((t) => (
                    <tr key={t.tripId}>
                      <td style={thtd}>
                        <strong>{t.tripNumber}</strong>
                        {t.departedAt ? (
                          <span className="birzha-text-muted birzha-ui-sm"> · {t.departedAt}</span>
                        ) : null}
                      </td>
                      <td style={thtd}>
                        {(t.destinationCode && destNameByCode.get(t.destinationCode)) || t.destinationCode || "—"}
                      </td>
                      <td style={{ ...thtd, textAlign: "right" }}>{money(t.revenueTotalKopecks)}</td>
                      <td style={{ ...thtd, textAlign: "right" }}>
                        {money(t.revenueCashKopecks)} / {money(t.revenueCardKopecks)} / {money(t.revenueDebtKopecks)}
                      </td>
                      <td style={{ ...thtd, textAlign: "right" }}>{money(t.tripExpensesKopecks)}</td>
                      <td style={{ ...thtd, textAlign: "right" }}>{money(t.debtOutstandingKopecks)}</td>
                      <td style={{ ...thtd, textAlign: "right", fontWeight: 700 }}>{money(t.netProfitKopecks)}</td>
                      <td style={thtd}>
                        <Link className="birzha-clean-ops-text-btn" to={tripReportHref(accounting.reports, t.tripId)}>
                          Отчёт
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {s ? (
        <section aria-labelledby="acc-overall-h">
          <h3 id="acc-overall-h" style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
            Общее за период
          </h3>
          <OverallKpis s={s} href={href} />
        </section>
      ) : null}

      <section className="birzha-admin-dash-modern__chart-card birzha-daily-chart-card" aria-labelledby="acc-daily-h">
        <div className="birzha-admin-dash-modern__chart-head">
          <h4 id="acc-daily-h" style={{ margin: 0, fontSize: "1rem" }}>Касса и расходы по дням</h4>
          <span className="birzha-text-muted birzha-ui-sm">наличные · карта · долг · расходы</span>
        </div>
        <DailySeriesChart variant="cashStack" from={from} to={to} destinationCode={destinationCode} tripId={tripId} />
      </section>

      <div className="birzha-admin-dash-modern__layout">
        <section className="birzha-admin-dash-modern__chart-card">
          <div className="birzha-admin-dash-modern__chart-head">
            <h4 style={{ margin: 0, fontSize: "1rem" }}>Остатки товара</h4>
          </div>
          <AccountingStockBalances />
        </section>
        <aside className="birzha-admin-dash-modern__ops-card">
          <h4 style={{ margin: "0 0 0.65rem", fontSize: "1rem" }}>Разделы</h4>
          <nav className="birzha-home-actions" aria-label="Разделы бухгалтерии" style={{ display: "grid", gap: "0.45rem" }}>
            <Link to={href(accounting.sales)} className="birzha-home-action">
              <span>Касса</span>
              <strong>Продажи</strong>
            </Link>
            <Link to={href(accounting.purchaserExpenses)} className="birzha-home-action">
              <span>Закупщики</span>
              <strong>Их расходы</strong>
            </Link>
            <Link to={href(accounting.sellerExpenses)} className="birzha-home-action">
              <span>Поле</span>
              <strong>Траты продавцов</strong>
            </Link>
            <Link to={href(accounting.rent)} className="birzha-home-action">
              <span>Помещение</span>
              <strong>Аренда / бронь</strong>
            </Link>
            <Link to={href(accounting.profit)} className="birzha-home-action">
              <span>Итог</span>
              <strong>Прибыль</strong>
            </Link>
          </nav>
        </aside>
      </div>
    </div>
  );
}
