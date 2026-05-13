import type { LoadingManifestSummary } from "../api/types.js";

/**
 * Погрузочные накладные по одному складу, новее — выше (для блока «Распределение»).
 */
export function manifestsForWarehouseSorted(
  manifests: readonly LoadingManifestSummary[] | undefined,
  warehouseId: string,
): LoadingManifestSummary[] {
  const wid = warehouseId.trim();
  if (!wid) {
    return [];
  }
  const src = manifests ?? [];
  return src
    .filter((m) => m.warehouseId === wid)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
