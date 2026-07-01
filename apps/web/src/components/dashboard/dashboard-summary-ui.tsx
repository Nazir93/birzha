import { useMemo, useRef, useState } from "react";

import type { DashboardStockSlice } from "../../api/types.js";
import {
  buildMassSegments,
  isMassRingPointerOnDonut,
  massRingPointerAngleDeg,
  massSegmentAtRingAngle,
} from "../../format/admin-dashboard-summary-rows.js";
import { kopecksToRubDisplay } from "../../format/money.js";

export type DashboardSummaryPeriod = "today" | "7d" | "30d" | "all";
export type DashboardSummaryChartMode = "mass" | "warehouses";

type MassRingTooltip = {
  x: number;
  y: number;
  label: string;
  kg: number;
};

export function formatDashboardKg(v: number): string {
  return `${v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} кг`;
}

export function formatDashboardPackages(v: number): string {
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

export function dashboardPeriodStartDate(period: DashboardSummaryPeriod): Date | null {
  if (period === "all") {
    return null;
  }
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const d = new Date(now);
  d.setDate(d.getDate() - (period === "7d" ? 7 : 30));
  return d;
}

function ratioPart(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return (value / total) * 100;
}

export function DashboardSummaryPeriodToggles({
  period,
  onChange,
}: {
  period: DashboardSummaryPeriod;
  onChange: (period: DashboardSummaryPeriod) => void;
}) {
  const items: Array<{ id: DashboardSummaryPeriod; label: string }> = [
    { id: "today", label: "Сегодня" },
    { id: "7d", label: "7 дней" },
    { id: "30d", label: "30 дней" },
    { id: "all", label: "Всё время" },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.45rem" }}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`birzha-btn birzha-btn--inline birzha-admin-summary-toggle${period === item.id ? " birzha-admin-summary-toggle--active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function MassDistributionRing({
  warehouseKg,
  loadingManifestKg,
  inTripKg,
  soldKg,
}: {
  warehouseKg: number;
  loadingManifestKg: number;
  inTripKg: number;
  soldKg: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<MassRingTooltip | null>(null);
  const segments = useMemo(
    () =>
      buildMassSegments({
        warehouseKg,
        loadingManifestKg,
        inTripRemainingKg: inTripKg,
        soldKg,
      }),
    [warehouseKg, loadingManifestKg, inTripKg, soldKg],
  );
  const total = warehouseKg + loadingManifestKg + inTripKg + soldKg;
  if (total <= 0) {
    return (
      <div className="birzha-admin-mass-ring birzha-admin-mass-ring--empty" aria-hidden>
        <span className="birzha-admin-mass-ring__empty-label">Нет массы</span>
      </div>
    );
  }
  const w = (warehouseKg / total) * 360;
  const lm = w + (loadingManifestKg / total) * 360;
  const tr = lm + (inTripKg / total) * 360;
  const gradient = `conic-gradient(
    #16a34a 0deg ${w}deg,
    #7c3aed ${w}deg ${lm}deg,
    #f59e0b ${lm}deg ${tr}deg,
    #2563eb ${tr}deg 360deg
  )`;

  const updateTooltip = (clientX: number, clientY: number) => {
    const el = ringRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) {
      return;
    }
    const rect = el.getBoundingClientRect();
    if (!isMassRingPointerOnDonut(clientX, clientY, rect)) {
      setTooltip(null);
      return;
    }
    const angle = massRingPointerAngleDeg(clientX, clientY, rect);
    const segment = massSegmentAtRingAngle(segments, angle);
    if (!segment) {
      setTooltip(null);
      return;
    }
    const wrapRect = wrap.getBoundingClientRect();
    setTooltip({
      x: clientX - wrapRect.left + 6,
      y: clientY - wrapRect.top + 6,
      label: segment.label,
      kg: segment.kg,
    });
  };

  return (
    <div ref={wrapRef} className="birzha-admin-mass-ring-wrap">
      <div
        ref={ringRef}
        className="birzha-admin-mass-ring birzha-admin-mass-ring--interactive"
        style={{ background: gradient }}
        role="img"
        aria-label={`Распределение массы: на складе ${warehouseKg.toFixed(0)} кг, в погрузочных накладных ${loadingManifestKg.toFixed(0)} кг, в открытых рейсах ${inTripKg.toFixed(0)} кг, продано ${soldKg.toFixed(0)} кг`}
        onPointerMove={(event) => updateTooltip(event.clientX, event.clientY)}
        onPointerLeave={() => setTooltip(null)}
      >
        <div className="birzha-admin-mass-ring__hole" aria-hidden />
      </div>
      {tooltip ? (
        <div
          className="birzha-admin-mass-ring__tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
          role="tooltip"
        >
          <span className="birzha-admin-mass-ring__tooltip-label">{tooltip.label}</span>
          <span className="birzha-admin-mass-ring__tooltip-value">{formatDashboardKg(tooltip.kg)}</span>
        </div>
      ) : null}
    </div>
  );
}

type MassSegment = {
  label: string;
  kg: number;
  fillClass: string;
};

export function MassBalanceLegend({ segments }: { segments: MassSegment[] }) {
  const total = segments.reduce((sum, row) => sum + row.kg, 0);
  if (total <= 0) {
    return null;
  }
  return (
    <div className="birzha-admin-dash-modern__mass-bars" aria-label="Распределение массы по этапам">
      {segments.map((row) => (
        <div key={row.label} className="birzha-admin-dash-modern__bar-row">
          <div className="birzha-admin-dash-modern__bar-label">{row.label}</div>
          <div className="birzha-admin-dash-modern__bar-track">
            <div
              className={`birzha-admin-dash-modern__bar-fill ${row.fillClass}`}
              style={{ width: `${ratioPart(row.kg, total)}%` }}
            />
          </div>
          <div className="birzha-admin-dash-modern__bar-value">{formatDashboardKg(row.kg)}</div>
        </div>
      ))}
    </div>
  );
}

export function SummaryTotalsStrip({ totals, caption }: { totals: DashboardStockSlice; caption: string }) {
  if (totals.kg <= 0 && totals.packages <= 0) {
    return null;
  }
  return (
    <p className="birzha-admin-dash-modern__summary-totals birzha-ui-sm" style={{ margin: "0 0 0.65rem" }}>
      <span className="birzha-text-muted">{caption}</span>{" "}
      <strong>{formatDashboardKg(totals.kg)}</strong>
      <span className="birzha-text-muted"> · </span>
      <strong>{formatDashboardPackages(totals.packages)} ящ.</strong>
      <span className="birzha-text-muted"> · </span>
      <strong>{kopecksToRubDisplay(totals.valueKopecks)} ₽</strong>
      <span className="birzha-text-muted"> (оценка по закупу)</span>
    </p>
  );
}

export type SummaryStockTableRowData = {
  key: string;
  label: string;
  sublabel?: string | null;
  kg: number;
  packages: number;
  valueKopecks: string;
  children?: SummaryStockTableRowData[];
};

function SummaryStockTableRow({
  row,
  maxKg,
  variant,
}: {
  row: SummaryStockTableRowData;
  maxKg: number;
  variant: "default" | "group" | "child";
}) {
  const showTrack = variant !== "child";
  const rowClass =
    variant === "group"
      ? "birzha-admin-summary-table__group-row"
      : variant === "child"
        ? "birzha-admin-summary-table__child-row"
        : undefined;

  return (
    <tr key={row.key} className={rowClass}>
      <th scope="row" className="birzha-admin-summary-table__label-cell">
        <div className="birzha-admin-summary-table__label">{row.label}</div>
        {row.sublabel ? (
          <div className="birzha-text-muted birzha-ui-sm birzha-admin-summary-table__sublabel">
            {row.sublabel}
          </div>
        ) : null}
        {showTrack ? (
          <div className="birzha-admin-dash-modern__warehouse-track birzha-admin-summary-table__track">
            <div
              className="birzha-admin-dash-modern__warehouse-fill"
              style={{ width: `${ratioPart(row.kg, maxKg)}%` }}
            />
          </div>
        ) : null}
      </th>
      <td className="birzha-admin-summary-table__num">{formatDashboardKg(row.kg)}</td>
      <td className="birzha-admin-summary-table__num">{formatDashboardPackages(row.packages)}</td>
      <td className="birzha-admin-summary-table__num birzha-admin-summary-table__sum">
        {kopecksToRubDisplay(row.valueKopecks)}
      </td>
    </tr>
  );
}

export function SummaryStockTable({
  labelColumn,
  rows,
  totals,
  maxKg,
  nestedGrades,
}: {
  labelColumn: string;
  rows: SummaryStockTableRowData[];
  totals?: DashboardStockSlice;
  maxKg: number;
  nestedGrades?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }}>—</p>;
  }
  return (
    <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-admin-summary-table-wrap">
      <table className="birzha-admin-summary-table">
        <colgroup>
          <col className="birzha-admin-summary-table__col-label" />
          <col className="birzha-admin-summary-table__col-num" />
          <col className="birzha-admin-summary-table__col-num" />
          <col className="birzha-admin-summary-table__col-sum" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="birzha-admin-summary-table__head">
              {labelColumn}
            </th>
            <th scope="col" className="birzha-admin-summary-table__head birzha-admin-summary-table__num-head">
              Кг
            </th>
            <th scope="col" className="birzha-admin-summary-table__head birzha-admin-summary-table__num-head">
              Ящ.
            </th>
            <th scope="col" className="birzha-admin-summary-table__head birzha-admin-summary-table__num-head">
              Сумма, ₽
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row) => {
            const hasChildren = nestedGrades && (row.children?.length ?? 0) > 0;
            const groupRows = [
              <SummaryStockTableRow
                key={row.key}
                row={row}
                maxKg={maxKg}
                variant={hasChildren ? "group" : "default"}
              />,
            ];
            if (hasChildren) {
              for (const child of row.children ?? []) {
                groupRows.push(
                  <SummaryStockTableRow key={child.key} row={child} maxKg={maxKg} variant="child" />,
                );
              }
            }
            return groupRows;
          })}
        </tbody>
        {totals ? (
          <tfoot>
            <tr className="birzha-admin-summary-table__foot">
              <th scope="row">Итого</th>
              <td className="birzha-admin-summary-table__num">{formatDashboardKg(totals.kg)}</td>
              <td className="birzha-admin-summary-table__num">{formatDashboardPackages(totals.packages)}</td>
              <td className="birzha-admin-summary-table__num birzha-admin-summary-table__sum">
                {kopecksToRubDisplay(totals.valueKopecks)}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
