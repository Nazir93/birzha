/** Клиентские пути: кабинеты (префиксы) и логические разделы. */
export const login = "/login" as const;

export const prefix = {
  admin: "/a",
  operations: "/o",
  sales: "/s",
  accounting: "/b",
} as const;

/** Маршруты кабинета «операции» (закуп, склад, логист, приём, руководитель в поле). */
export const ops = {
  reports: `${prefix.operations}/reports`,
  /** Рейсы: создание, закрытие, удаление (кабинет операций и админки). */
  trips: `${prefix.operations}/trips`,
  purchaseNakladnaya: `${prefix.operations}/purchase-nakladnaya`,
  distribution: `${prefix.operations}/distribution`,
  loadingManifests: `${prefix.operations}/loading-manifests`,
  operations: `${prefix.operations}/operations`,
  sellerDispatch: `${prefix.operations}/seller-dispatch`,
  assignSeller: `${prefix.operations}/assign-seller`,
  /** Архив: закрытые рейсы, проданные накладные, погрузочные по закрытым рейсам. */
  archive: `${prefix.operations}/archive`,
} as const;

/** Справочники (склады, калибры) и meta — узкий круг. */
export const adminRoutes = {
  /** Главная админки — сводка KPI. */
  home: prefix.admin,
  reports: `${prefix.admin}/reports`,
  /** Рейсы: создание, закрытие, удаление (в админском кабинете). */
  trips: `${prefix.admin}/trips`,
  purchaseNakladnaya: `${prefix.admin}/purchase-nakladnaya`,
  distribution: `${prefix.admin}/distribution`,
  loadingManifests: `${prefix.admin}/loading-manifests`,
  operations: `${prefix.admin}/operations`,
  sellerDispatch: `${prefix.admin}/seller-dispatch`,
  assignSeller: `${prefix.admin}/assign-seller`,
  inventory: `${prefix.admin}/inventory`,
  /** Реестр рейсов: фильтр `?status=all|open|closed`, поиск в UI. */
  tripRegistry: `${prefix.admin}/trip-registry`,
  /** Рейсы с ненулевым погруженным остатком (учёт). */
  transitTrips: `${prefix.admin}/transit-trips`,
  /** Продажи по продавцам (поиск, даты рейсов). */
  soldBySeller: `${prefix.admin}/sold-by-seller`,
  /** Склады: справочник + остатки по выбранному складу. */
  stockWarehouses: `${prefix.admin}/stock-warehouses`,
  /** Журнал списаний брака с остатка (все накладные). */
  warehouseWriteOffsLedger: `${prefix.admin}/warehouse-write-offs`,
  users: `${prefix.admin}/users`,
  service: `${prefix.admin}/service`,
  archive: `${prefix.admin}/archive`,
} as const;

export const sales = {
  home: prefix.sales,
  reports: `${prefix.sales}/reports`,
  operations: `${prefix.sales}/operations`,
  archive: `${prefix.sales}/archive`,
} as const;

export const accounting = {
  home: prefix.accounting,
  reports: `${prefix.accounting}/reports`,
  counterparties: `${prefix.accounting}/counterparties`,
  sellerDispatch: `${prefix.accounting}/seller-dispatch`,
  trade: `${prefix.accounting}/trade`,
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
    service: "/service",
  },
} as const;

/** Список путей legacy для `Route` — плоский, без дублирования ключей. */
export const legacyPathList: readonly string[] = [
  routes.legacy.reports,
  routes.legacy.purchaseNakladnaya,
  routes.legacy.distribution,
  routes.legacy.operations,
  routes.legacy.service,
] as const;

/**
 * Карточка сохранённой накладной (логистика/склад — в кабинете /o).
 */
export function purchaseNakladnayaDocumentPath(documentId: string, cabinet: "operations" | "admin" = "operations"): string {
  const base = cabinet === "admin" ? adminRoutes.purchaseNakladnaya : ops.purchaseNakladnaya;
  return `${base}/${encodeURIComponent(documentId)}`;
}

export function purchaseNakladnayaBasePathForPath(pathname: string): string {
  return pathname === prefix.admin || pathname.startsWith(`${prefix.admin}/`)
    ? adminRoutes.purchaseNakladnaya
    : ops.purchaseNakladnaya;
}

export function purchaseNakladnayaDocumentPathForPath(pathname: string, documentId: string): string {
  return `${purchaseNakladnayaBasePathForPath(pathname)}/${encodeURIComponent(documentId)}`;
}

export function adminAwarePathForPath(pathname: string, adminPath: string, operationsPath: string): string {
  return pathname === prefix.admin || pathname.startsWith(`${prefix.admin}/`) ? adminPath : operationsPath;
}
