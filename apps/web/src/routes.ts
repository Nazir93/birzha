/** Клиентские пути: кабинеты (префиксы) и логические разделы. */
export const login = "/login" as const;

export const prefix = {
  admin: "/a",
  operations: "/o",
  sales: "/s",
  accounting: "/b",
} as const;

export type OpsCabinetPrefix = typeof prefix.operations | typeof prefix.admin;

/** Сегменты путей, общие для `/o` и `/a`. */
const SHARED_OPS_SEGMENTS = {
  reports: "reports",
  trips: "trips",
  purchaseNakladnaya: "purchase-nakladnaya",
  distribution: "distribution",
  loadingManifests: "loading-manifests",
  operations: "operations",
  sellerDispatch: "seller-dispatch",
  assignSeller: "assign-seller",
  archive: "archive",
} as const;

export type SharedOpsSegment = keyof typeof SHARED_OPS_SEGMENTS;

function sharedOpsPaths(root: OpsCabinetPrefix) {
  const s = SHARED_OPS_SEGMENTS;
  return {
    reports: `${root}/${s.reports}`,
    trips: `${root}/${s.trips}`,
    purchaseNakladnaya: `${root}/${s.purchaseNakladnaya}`,
    distribution: `${root}/${s.distribution}`,
    loadingManifests: `${root}/${s.loadingManifests}`,
    operations: `${root}/${s.operations}`,
    sellerDispatch: `${root}/${s.sellerDispatch}`,
    assignSeller: `${root}/${s.assignSeller}`,
    archive: `${root}/${s.archive}`,
  } as const;
}

/** Путь панели в кабинете `/o` или `/a`. */
export function sharedOpsPath(cabinet: "operations" | "admin", segment: SharedOpsSegment): string {
  const root = cabinet === "admin" ? prefix.admin : prefix.operations;
  return sharedOpsPaths(root)[segment];
}

/** Маршруты кабинета «операции» (закуп, склад, логист, приём, руководитель в поле). */
export const ops = sharedOpsPaths(prefix.operations);

/** Справочники (склады, калибры) и meta — узкий круг. */
export const adminRoutes = {
  /** Главная админки — сводка KPI. */
  home: prefix.admin,
  ...sharedOpsPaths(prefix.admin),
  /** Настройки: справочники и сотрудники. */
  settings: `${prefix.admin}/settings`,
  settingsCatalog: `${prefix.admin}/settings/catalog`,
  settingsTeam: `${prefix.admin}/settings/team`,
  /** Редиректы со старых URL. */
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
  },
} as const;

/** Список путей legacy для `Route` — плоский, без дублирования ключей. */
export const legacyPathList: readonly string[] = [
  routes.legacy.reports,
  routes.legacy.purchaseNakladnaya,
  routes.legacy.distribution,
  routes.legacy.operations,
] as const;

/**
 * Карточка сохранённой накладной (логистика/склад — в кабинете /o).
 */
export function isAdminCabinetPath(pathname: string): boolean {
  return pathname === prefix.admin || pathname.startsWith(`${prefix.admin}/`);
}

export function purchaseNakladnayaDocumentPath(documentId: string, cabinet: "operations" | "admin" = "operations"): string {
  return `${sharedOpsPath(cabinet, "purchaseNakladnaya")}/${encodeURIComponent(documentId)}`;
}

export function purchaseNakladnayaBasePathForPath(pathname: string): string {
  return sharedOpsPath(isAdminCabinetPath(pathname) ? "admin" : "operations", "purchaseNakladnaya");
}

export function purchaseNakladnayaDocumentPathForPath(pathname: string, documentId: string): string {
  return `${purchaseNakladnayaBasePathForPath(pathname)}/${encodeURIComponent(documentId)}`;
}

export function adminAwarePathForPath(pathname: string, adminPath: string, operationsPath: string): string {
  return isAdminCabinetPath(pathname) ? adminPath : operationsPath;
}
