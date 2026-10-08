import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  compactRubTick,
  dailyChartRows,
  formatKgTooltip,
  formatRubTooltip,
  hasAnyDailyActivity,
  type DailyChartRow,
} from "../../format/daily-series-chart-rows.js";
import {
  accountingDailySeriesQueryOptions,
  type AccountingDailySeriesParams,
} from "../../query/accounting-daily-series.js";
import { ErrorAlert } from "../../ui/ErrorAlerts.js";
import { LoadingBlock } from "../../ui/LoadingIndicator.js";

/** Цвета данных (не UI-акцент): касса — фиолетовый, карта — teal, долг — amber, масса — синий. */
const COLOR_REVENUE = "var(--birzha-accent)";
const COLOR_CASH = "#8b5cf6";
const COLOR_CARD = "#14b8a6";
const COLOR_DEBT = "#f59e0b";
const COLOR_EXPENSES = "#ef4444";
const COLOR_MASS = "#3b82f6";
const COLOR_GRID = "var(--birzha-border-hairline)";
const COLOR_TICK = "var(--color-text-muted)";

type ChartVariant = "revenueMass" | "cashStack";

export type DailySeriesChartProps = AccountingDailySeriesParams & {
  variant: ChartVariant;
  /** Высота области графика, px. */
  height?: number;
};

type TooltipValue = number | string | ReadonlyArray<number | string>;
type TooltipName = number | string;

function tooltipFormatter(value: TooltipValue | undefined, name: TooltipName | undefined): [string, string] {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  const label = String(name ?? "");
  if (label === "Продано") {
    return [formatKgTooltip(n), label];
  }
  return [formatRubTooltip(n), label];
}

function tickInterval(rowsCount: number): number | "preserveStartEnd" {
  if (rowsCount <= 10) {
    return 0;
  }
  return "preserveStartEnd";
}

function RevenueMassChart({ rows, height }: { rows: DailyChartRow[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="birzhaRevenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR_CASH} stopOpacity={0.35} />
            <stop offset="100%" stopColor={COLOR_CASH} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={COLOR_GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: COLOR_TICK, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval(rows.length)}
          minTickGap={18}
        />
        <YAxis
          yAxisId="rub"
          tick={{ fill: COLOR_TICK, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={compactRubTick}
        />
        <YAxis
          yAxisId="kg"
          orientation="right"
          tick={{ fill: COLOR_TICK, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
        />
        <Tooltip
          formatter={tooltipFormatter}
          contentStyle={{
            background: "var(--birzha-surface)",
            border: "1px solid var(--birzha-border-hairline)",
            borderRadius: 12,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--color-text-muted)", marginBottom: 4 }}
          cursor={{ fill: "var(--birzha-accent-soft)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={8} />
        <Bar yAxisId="kg" dataKey="soldKg" name="Продано" fill={COLOR_MASS} fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Area
          yAxisId="rub"
          type="monotone"
          dataKey="revenueRub"
          name="Выручка"
          stroke={COLOR_REVENUE}
          strokeWidth={2}
          fill="url(#birzhaRevenueFill)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function CashStackChart({ rows, height }: { rows: DailyChartRow[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COLOR_GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: COLOR_TICK, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval(rows.length)}
          minTickGap={18}
        />
        <YAxis
          tick={{ fill: COLOR_TICK, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={compactRubTick}
        />
        <Tooltip
          formatter={tooltipFormatter}
          contentStyle={{
            background: "var(--birzha-surface)",
            border: "1px solid var(--birzha-border-hairline)",
            borderRadius: 12,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--color-text-muted)", marginBottom: 4 }}
          cursor={{ fill: "var(--birzha-accent-soft)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={8} />
        <Bar dataKey="cashRub" name="Наличные" stackId="cash" fill={COLOR_CASH} maxBarSize={28} />
        <Bar dataKey="cardRub" name="Карта / перевод" stackId="cash" fill={COLOR_CARD} maxBarSize={28} />
        <Bar dataKey="debtRub" name="В долг" stackId="cash" fill={COLOR_DEBT} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line
          type="monotone"
          dataKey="expensesRub"
          name="Расходы"
          stroke={COLOR_EXPENSES}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * График по дням за период: `revenueMass` — выручка (area) + продано кг (bar);
 * `cashStack` — касса по видам оплаты (stacked) + линия расходов.
 */
export function DailySeriesChart({ variant, height = 260, ...params }: DailySeriesChartProps) {
  const q = useQuery(accountingDailySeriesQueryOptions(params));
  const rows = useMemo(() => dailyChartRows(q.data?.days ?? []), [q.data]);

  if (q.isPending) {
    return <LoadingBlock label="Загружаем график…" />;
  }
  if (q.isError) {
    return <ErrorAlert error={q.error} />;
  }
  if (!hasAnyDailyActivity(rows)) {
    return (
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
        За выбранный период операций нет — график появится после первых продаж или расходов.
      </p>
    );
  }
  return (
    <div className="birzha-daily-chart" aria-label="График по дням">
      {variant === "revenueMass" ? <RevenueMassChart rows={rows} height={height} /> : <CashStackChart rows={rows} height={height} />}
    </div>
  );
}
