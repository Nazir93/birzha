import { adminAwarePathForPath, adminRoutes, ops } from "../routes.js";

/**
 * Ссылка «к операциям» из списка рейсов — раздел погрузки (не «Недостача по рейсу»).
 */
export function tripListOperationsHref(pathname: string): string {
  return adminAwarePathForPath(pathname, adminRoutes.distribution, ops.distribution);
}
