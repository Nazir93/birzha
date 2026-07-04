import type { LoadingManifestSummary } from "../api/types.js";

/** Все активные ПН, новее — выше (блок на странице погрузки). */
export function sortLoadingManifestsByCreatedAtDesc(
  manifests: readonly LoadingManifestSummary[],
): LoadingManifestSummary[] {
  return manifests
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Номера погрузочных по рейсу (для подписи в select). */
export function groupLoadingManifestNumbersByTripId(
  manifests: readonly LoadingManifestSummary[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const m of manifests) {
    const tripId = m.tripId?.trim();
    if (!tripId) {
      continue;
    }
    const num = m.manifestNumber.trim();
    if (!num) {
      continue;
    }
    const arr = map.get(tripId) ?? [];
    arr.push(num);
    map.set(tripId, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.localeCompare(b, "ru"));
  }
  return map;
}

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
