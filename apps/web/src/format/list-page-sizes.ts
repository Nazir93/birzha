/** Строк на странице в рабочих списках: рейсы, закупочные и погрузочные накладные. */
export const WORK_LIST_PAGE_SIZE = 15;

/** Архив: рейсы и накладные постранично. */
export const ARCHIVE_LIST_PAGE_SIZE = 25;

/** Настройки документов (админ): крупнее, реже листают. */
export const SETTINGS_LIST_PAGE_SIZE = 50;

export function listPageCount(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

export function sliceListPage<T>(items: readonly T[], pageIndex: number, pageSize: number): T[] {
  const start = pageIndex * pageSize;
  return items.slice(start, start + pageSize);
}

export function clampListPageIndex(pageIndex: number, totalCount: number, pageSize: number): number {
  const pageCount = listPageCount(totalCount, pageSize);
  return Math.min(Math.max(0, pageIndex), pageCount - 1);
}
