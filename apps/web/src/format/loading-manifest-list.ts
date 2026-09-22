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

export type LoadingManifestListRow =
  | {
      kind: "manifest";
      key: string;
      manifest: LoadingManifestSummary;
    }
  | {
      kind: "trip";
      key: string;
      tripId: string;
      manifests: LoadingManifestSummary[];
      docDate: string;
      destinationName: string;
      warehouseLabel: string;
      totalKg: number;
      packagesApprox: number | null;
      newestCreatedAt: string;
    };

function sumPackagesApprox(manifests: readonly LoadingManifestSummary[]): number | null {
  let sum = 0;
  let has = false;
  for (const m of manifests) {
    if (m.packagesApprox == null || !Number.isFinite(m.packagesApprox) || m.packagesApprox <= 0) {
      continue;
    }
    sum += m.packagesApprox;
    has = true;
  }
  return has ? sum : null;
}

function warehouseLabelForGroup(manifests: readonly LoadingManifestSummary[]): string {
  const names = [
    ...new Set(manifests.map((m) => m.warehouseName.trim()).filter((n) => n.length > 0)),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  return names.length > 0 ? names.join(", ") : "—";
}

/**
 * В общем списке ПН с одним рейсом — одна строка (склады и кг суммируются).
 * Без рейса или при `groupByTrip: false` — каждая ПН отдельно.
 */
export function groupLoadingManifestsForList(
  manifests: readonly LoadingManifestSummary[],
  options?: { groupByTrip?: boolean },
): LoadingManifestListRow[] {
  const groupByTrip = options?.groupByTrip !== false;
  if (!groupByTrip) {
    return manifests.map((manifest) => ({
      kind: "manifest" as const,
      key: manifest.id,
      manifest,
    }));
  }

  const unassigned: LoadingManifestSummary[] = [];
  const byTrip = new Map<string, LoadingManifestSummary[]>();
  for (const m of manifests) {
    const tripId = m.tripId?.trim();
    if (!tripId) {
      unassigned.push(m);
      continue;
    }
    const arr = byTrip.get(tripId) ?? [];
    arr.push(m);
    byTrip.set(tripId, arr);
  }

  const rows: LoadingManifestListRow[] = [];
  for (const m of unassigned) {
    rows.push({ kind: "manifest", key: m.id, manifest: m });
  }
  for (const [tripId, group] of byTrip) {
    const sorted = sortLoadingManifestsByCreatedAtDesc(group);
    if (sorted.length === 1) {
      rows.push({ kind: "manifest", key: sorted[0]!.id, manifest: sorted[0]! });
      continue;
    }
    rows.push({
      kind: "trip",
      key: `trip:${tripId}`,
      tripId,
      manifests: sorted,
      docDate: sorted[0]!.docDate,
      destinationName: sorted[0]!.destinationName,
      warehouseLabel: warehouseLabelForGroup(sorted),
      totalKg: sorted.reduce((a, x) => a + x.totalKg, 0),
      packagesApprox: sumPackagesApprox(sorted),
      newestCreatedAt: sorted[0]!.createdAt,
    });
  }

  return rows.sort((a, b) => {
    const aAt = a.kind === "manifest" ? a.manifest.createdAt : a.newestCreatedAt;
    const bAt = b.kind === "manifest" ? b.manifest.createdAt : b.newestCreatedAt;
    return new Date(bAt).getTime() - new Date(aAt).getTime();
  });
}
