import type { LoadingManifestDetail, LoadingManifestSummary } from "../../api/types.js";

/** Карточка GET /loading-manifests/:id для списка, пока общий GET /list ещё без этой строки. */
export function loadingSummaryFromDetail(d: LoadingManifestDetail): LoadingManifestSummary {
  let totalKg = 0;
  let packagesSum = 0;
  let linesWithPkg = 0;
  for (const ln of d.lines) {
    totalKg += ln.kg;
    const raw = ln.packageCount?.trim();
    if (raw != null && raw !== "") {
      const n = Number(raw.replace(",", "."));
      if (Number.isFinite(n) && n > 0) {
        packagesSum += n;
        linesWithPkg += 1;
      }
    }
  }
  return {
    id: d.id,
    manifestNumber: d.manifestNumber,
    docDate: d.docDate,
    warehouseId: d.warehouseId,
    warehouseName: d.warehouseName,
    warehouseCode: d.warehouseCode,
    destinationCode: d.destinationCode,
    destinationName: d.destinationName,
    tripId: d.tripId,
    createdAt: d.createdAt,
    lineCount: d.lines.length,
    totalKg,
    packagesApprox: linesWithPkg > 0 ? packagesSum : null,
    lineWarehouseNames: d.lineWarehouseNames,
    calibers: [],
  };
}
