/** Клиентские пути: кабинеты (префиксы) и логические разделы. */
export const login = "/login" as const;

export const prefix = {
  admin: "/a",
  operations: "/o",
  sales: "/s",
  accounting: "/b",
} as const;

export type CabinetPrefix = (typeof prefix)[keyof typeof prefix];

/** Маршруты кабинета «операции» (закуп, склад, логист, приём, руководитель в поле). */
export const ops = {
  reports: `${prefix.operations}/reports`,
  /** Алиас на отчёты/рейсы (удобно логисту и закладкам). */
  trips: `${prefix.operations}/trips`,
  purchaseNakladnaya: `${prefix.operations}/purchase-nakladnaya`,
  distribution: `${prefix.operations}/distribution`,
  operations: `${prefix.operations}/operations`,
  offline: `${prefix.operations}/offline`,
} as const;

/** Справочники (склады, калибры) и meta — узкий круг. */
export const adminRoutes = {
  /** Главная админки — сводка KPI. */
  home: prefix.admin,
  inventory: `${prefix.admin}/inventory`,
  service: `${prefix.admin}/service`,
} as const;

export const sales = {
  home: prefix.sales,
  reports: `${prefix.sales}/reports`,
  operations: `${prefix.sales}/operations`,
  offline: `${prefix.sales}/offline`,
} as const;

export const accounting = {
  home: prefix.accounting,
  reports: `${prefix.accounting}/reports`,
  counterparties: `${prefix.accounting}/counterparties`,
} as const;

/**
 * Единый экспорт: используйте `ops.*`, `adminRoutes.*` и т.д.
 * `routes.legacy` — старые пути без префикса, на них вешается редирект.
 */
export const routes = {
  login,
  prefix,
  ops,
  admin: adminRoutes,
  sales,
  accounting,
  /** Старые пути (до кабинетов) — только для обратной совместимости и тестов. */
  legacy: {
    reports: "/reports",
    purchaseNakladnaya: "/purchase-nakladnaya",
    distribution: "/distribution",
    operations: "/operations",
    offline: "/offline",
    service: "/service",
  },
} as const;

/** Список путей legacy для `Route` — плоский, без дублирования ключей. */
export const legacyPathList: readonly string[] = [
  routes.legacy.reports,
  routes.legacy.purchaseNakladnaya,
  routes.legacy.distribution,
  routes.legacy.operations,
  routes.legacy.offline,
  routes.legacy.service,
] as const;

/**
 * Карточка сохранённой накладной (логистика/склад — в кабинете /o).
 */
export function purchaseNakladnayaDocumentPath(documentId: string): string {
  return `${ops.purchaseNakladnaya}/${encodeURIComponent(documentId)}`;
}
