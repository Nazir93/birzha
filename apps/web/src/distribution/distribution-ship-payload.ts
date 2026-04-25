const STORAGE_KEY = "birzha:distribution:shipBatches" as const;

export type DistributionShipPayload = { v: 1; batchIds: string[] };

export function saveDistributionShipPayload(p: DistributionShipPayload): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // private mode / quota
  }
}

export function readDistributionShipPayload(): DistributionShipPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const j = JSON.parse(raw) as unknown;
    if (j == null || typeof j !== "object" || (j as DistributionShipPayload).v !== 1) {
      return null;
    }
    const batchIds = (j as DistributionShipPayload).batchIds;
    if (!Array.isArray(batchIds) || !batchIds.every((x) => typeof x === "string" && x.length > 0)) {
      return null;
    }
    return { v: 1, batchIds: [...new Set(batchIds)] };
  } catch {
    return null;
  }
}

export function clearDistributionShipPayload(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
