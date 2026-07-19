import { adminAwarePathForPath, adminRoutes, ops } from "../routes.js";

/**
 * Ссылка «к операциям» из списка рейсов — раздел погрузки именно этого рейса
 * (не общая лента и не «Недостача по рейсу»).
 */
export function tripListOperationsHref(pathname: string, tripId?: string | null): string {
  const base = adminAwarePathForPath(pathname, adminRoutes.distribution, ops.distribution);
  const id = tripId?.trim() ?? "";
  if (!id) {
    return base;
  }
  return `${base}?${new URLSearchParams({ trip: id }).toString()}`;
}
