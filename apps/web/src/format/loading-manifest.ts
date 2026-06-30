import type { BatchListItem } from "../api/types.js";
import { formatNakladLineLabel } from "./batch-label.js";
import { escapeCsvField } from "./csv.js";
import { formatPurchaseDocDateRu } from "./purchase-doc-date.js";

/** Подпись складов в шапке ПН: один или «Манас, Каякент». */
export function formatManifestWarehouseNames(names: readonly string[] | undefined, fallback: string): string {
  const unique = [...new Set((names ?? []).map((n) => n.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
  if (unique.length === 0) {
    return fallback.trim() || "—";
  }
  return unique.join(", ");
}

/** Остаток в ящиках: доля onWarehouseKg к totalKg, × ящиков по строке накладной. */
export function estimatedPackageCountOnShelf(b: BatchListItem): number | null {
  const linePk = b.nakladnaya?.linePackageCount;
  if (linePk == null || linePk <= 0) {
    return null;
  }
  if (b.totalKg <= 0) {
    return null;
  }
  return Math.max(0, Math.round((b.onWarehouseKg / b.totalKg) * linePk));
}

/**
 * Какие партии показывать в «листе на погрузку» при мультиселекте накладных.
 * @param documentOptionCount 0 — фильтр по накл. не задан (показать все строки); иначе только отмеченные documentId
 */
export function filterBatchesForLoadingManifest(
  batches: readonly BatchListItem[],
  documentOptionCount: number,
  selectedDocumentIds: ReadonlySet<string>,
): BatchListItem[] {
  return batches.filter((b) => {
    if (b.onWarehouseKg <= 0) {
      return false;
    }
    if (documentOptionCount === 0) {
      return true;
    }
    const docId = b.nakladnaya?.documentId;
    if (!docId) {
      return true;
    }
    return selectedDocumentIds.has(docId);
  });
}

export function sumLoadingManifestTotals(included: readonly BatchListItem[]): {
  kg: number;
  pkg: number;
  linesWithPkg: number;
  batchCount: number;
} {
  let kg = 0;
  let pkg = 0;
  let linesWithPkg = 0;
  for (const b of included) {
    kg += b.onWarehouseKg;
    const e = estimatedPackageCountOnShelf(b);
    if (e != null) {
      pkg += e;
      linesWithPkg += 1;
    }
  }
  return { kg, pkg, linesWithPkg, batchCount: included.length };
}

/** Суммы по калибру/товарной строке (как в подписи партии), для свода «сколько веса и ящ. по каждому калибру». */
export function aggregateBatchesByCaliberLine(batches: readonly BatchListItem[]): {
  lineLabel: string;
  totalKg: number;
  totalPkg: number;
  linesWithPkg: number;
  partCount: number;
  batches: BatchListItem[];
}[] {
  const m = new Map<
    string,
    {
      lineLabel: string;
      totalKg: number;
      totalPkg: number;
      linesWithPkg: number;
      partCount: number;
      batches: BatchListItem[];
    }
  >();
  for (const b of batches) {
    const lineLabel = formatNakladLineLabel(b);
    if (!m.has(lineLabel)) {
      m.set(lineLabel, { lineLabel, totalKg: 0, totalPkg: 0, linesWithPkg: 0, partCount: 0, batches: [] });
    }
    const g = m.get(lineLabel)!;
    g.totalKg += b.onWarehouseKg;
    g.partCount += 1;
    g.batches.push(b);
    const e = estimatedPackageCountOnShelf(b);
    if (e != null) {
      g.totalPkg += e;
      g.linesWithPkg += 1;
    }
  }
  return Array.from(m.values()).sort((a, b) => a.lineLabel.localeCompare(b.lineLabel, "ru"));
}

/** Ключ строки без id закупочной накладной в данных (все такие партии в одной строке). */
export const AGGREGATE_NO_PURCHASE_DOCUMENT_KEY = "__no_purchase_document__";

/** Свод по закупочной накладной: одна строка — все партии с тем же `documentId`. */
export type PurchaseDocumentAggregateRow = {
  rowKey: string;
  documentId: string | null;
  documentNumber: string;
  displayLabel: string;
  totalKg: number;
  totalPkg: number;
  linesWithPkg: number;
  partCount: number;
  batches: BatchListItem[];
};

export function aggregateBatchesByPurchaseDocument(batches: readonly BatchListItem[]): PurchaseDocumentAggregateRow[] {
  type Acc = {
    rowKey: string;
    documentId: string | null;
    documentNumber: string;
    totalKg: number;
    totalPkg: number;
    linesWithPkg: number;
    partCount: number;
    batches: BatchListItem[];
  };
  const m = new Map<string, Acc>();
  for (const b of batches) {
    const docId = b.nakladnaya?.documentId?.trim();
    const docNum = b.nakladnaya?.documentNumber?.trim() ?? "";
    const rowKey = docId && docId.length > 0 ? docId : AGGREGATE_NO_PURCHASE_DOCUMENT_KEY;
    if (!m.has(rowKey)) {
      m.set(rowKey, {
        rowKey,
        documentId: docId && docId.length > 0 ? docId : null,
        documentNumber: docNum,
        totalKg: 0,
        totalPkg: 0,
        linesWithPkg: 0,
        partCount: 0,
        batches: [],
      });
    }
    const g = m.get(rowKey)!;
    g.totalKg += b.onWarehouseKg;
    g.partCount += 1;
    g.batches.push(b);
    const e = estimatedPackageCountOnShelf(b);
    if (e != null) {
      g.totalPkg += e;
      g.linesWithPkg += 1;
    }
    if (docNum) {
      g.documentNumber = docNum;
    }
  }
  const out: PurchaseDocumentAggregateRow[] = [];
  for (const v of m.values()) {
    const displayLabel =
      v.documentId && v.documentNumber
        ? `№ ${v.documentNumber}`
        : v.documentId
          ? `№ …${v.documentId.slice(-6)}`
          : "Без накладной в данных";
    out.push({
      rowKey: v.rowKey,
      documentId: v.documentId,
      documentNumber: v.documentNumber,
      displayLabel,
      totalKg: v.totalKg,
      totalPkg: v.totalPkg,
      linesWithPkg: v.linesWithPkg,
      partCount: v.partCount,
      batches: v.batches,
    });
  }
  return out.sort((a, b) => {
    if (a.rowKey === AGGREGATE_NO_PURCHASE_DOCUMENT_KEY) {
      return 1;
    }
    if (b.rowKey === AGGREGATE_NO_PURCHASE_DOCUMENT_KEY) {
      return -1;
    }
    return a.displayLabel.localeCompare(b.displayLabel, "ru");
  });
}

/** Кг на складе по `allocation.destination`, без направления и отдельно в пути — для сводов в распределении и погрузке. */
export type AllocationShelfBreakdown = {
  assignedRows: { code: string; label: string; kg: number; batchCount: number }[];
  unassigned: { kg: number; batchCount: number };
  inTransit: { kg: number; batchCount: number };
};

export function summarizeAllocationBreakdown(
  batches: readonly BatchListItem[],
  destAllowed: readonly string[],
  labelDest: Record<string, string>,
): AllocationShelfBreakdown {
  const assignedMap = new Map<string, { kg: number; batchCount: number }>();
  let unKg = 0;
  let unBc = 0;
  let trKg = 0;
  let trBc = 0;

  for (const b of batches) {
    const ow = b.onWarehouseKg;
    if (ow > 0) {
      const d = b.allocation?.destination?.trim();
      if (!d) {
        unKg += ow;
        unBc += 1;
      } else {
        const cur = assignedMap.get(d) ?? { kg: 0, batchCount: 0 };
        cur.kg += ow;
        cur.batchCount += 1;
        assignedMap.set(d, cur);
      }
    }
    if (b.inTransitKg > 0) {
      trKg += b.inTransitKg;
      trBc += 1;
    }
  }

  const assignedRows: { code: string; label: string; kg: number; batchCount: number }[] = [];
  const consumed = new Set<string>();
  for (const code of destAllowed) {
    const v = assignedMap.get(code);
    if (v && v.kg > 0) {
      assignedRows.push({ code, label: labelDest[code] ?? code, kg: v.kg, batchCount: v.batchCount });
      consumed.add(code);
    }
  }
  const extras = [...assignedMap.entries()]
    .filter(([code, v]) => !consumed.has(code) && v.kg > 0)
    .map(([code, v]) => ({
      code,
      label: labelDest[code] ?? code,
      kg: v.kg,
      batchCount: v.batchCount,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  assignedRows.push(...extras);

  return {
    assignedRows,
    unassigned: { kg: unKg, batchCount: unBc },
    inTransit: { kg: trKg, batchCount: trBc },
  };
}

/** Строка карточки ПН (GET), достаточная для свода по калибру. */
export type LoadingManifestDetailLineForCaliber = {
  kg: number;
  packageCount: string | null;
  productGroup: string | null;
  productGradeCode: string | null;
};

function parseManifestLinePackageCount(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === "") {
    return null;
  }
  const n = Number(String(raw).replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

/** Свод «на машину»: одна строка на калибр (кг и ящики суммируются по всем партиям в ПН). */
export function aggregateLoadingManifestLinesByCaliber(
  lines: readonly LoadingManifestDetailLineForCaliber[],
): { caliberLabel: string; totalKg: number; totalPackages: number | null }[] {
  const m = new Map<string, { totalKg: number; pkgSum: number; pkgLines: number }>();
  for (const line of lines) {
    const caliberLabel = `${line.productGroup?.trim() || "Товар"} · ${line.productGradeCode?.trim() || "—"}`;
    const cur = m.get(caliberLabel) ?? { totalKg: 0, pkgSum: 0, pkgLines: 0 };
    cur.totalKg += line.kg;
    const p = parseManifestLinePackageCount(line.packageCount);
    if (p != null) {
      cur.pkgSum += p;
      cur.pkgLines += 1;
    }
    m.set(caliberLabel, cur);
  }
  return [...m.entries()]
    .map(([caliberLabel, v]) => ({
      caliberLabel,
      totalKg: v.totalKg,
      totalPackages: v.pkgLines > 0 ? Math.round(v.pkgSum) : null,
    }))
    .sort((a, b) => a.caliberLabel.localeCompare(b.caliberLabel, "ru"));
}

export type LoadingManifestRoadCsvParams = {
  manifestNumber: string;
  docDate: string;
  warehouseLabel: string;
  destinationName: string;
  tripLabel: string;
  rows: { caliberLabel: string; totalKg: number; totalPackages: number | null }[];
};

/** CSV для «накладной на машину» (UTF-8, `;`, поля через escapeCsvField). */
export function loadingManifestRoadCsvContent(p: LoadingManifestRoadCsvParams): string {
  const lines: string[] = [];
  lines.push(
    `Погрузочная накладная (на машину);${escapeCsvField(
      formatLoadingManifestDisplayName({
        manifestNumber: p.manifestNumber,
        destinationName: p.destinationName,
      }),
    )}`,
  );
  lines.push(`Дата;${escapeCsvField(p.docDate)}`);
  lines.push(`Склад;${escapeCsvField(p.warehouseLabel)}`);
  lines.push(`Направление;${escapeCsvField(p.destinationName)}`);
  lines.push(`Рейс;${escapeCsvField(p.tripLabel)}`);
  lines.push("");
  lines.push(["Калибр", "Кг", "Ящ"].map(escapeCsvField).join(";"));
  let sumKg = 0;
  let sumPkg = 0;
  let anyPkg = false;
  for (const r of p.rows) {
    sumKg += r.totalKg;
    if (r.totalPackages != null) {
      sumPkg += r.totalPackages;
      anyPkg = true;
    }
    lines.push(
      [
        escapeCsvField(r.caliberLabel),
        String(r.totalKg).replace(".", ","),
        r.totalPackages != null ? String(r.totalPackages) : "",
      ].join(";"),
    );
  }
  lines.push(
    [
      escapeCsvField("Итого"),
      String(sumKg).replace(".", ","),
      anyPkg ? String(Math.round(sumPkg)) : "",
    ].join(";"),
  );
  return lines.join("\r\n");
}

/** Автономер вида ПН-20260519-1430 — в списках не показываем, чтобы не путать с названием. */
const AUTO_LOADING_MANIFEST_NUMBER_RE = /^ПН-\d{6,}(-\d+)?$/iu;

export type LoadingManifestLabelFields = {
  manifestNumber: string;
  destinationName: string;
};

export function isAutoGeneratedLoadingManifestNumber(manifestNumber: string): boolean {
  return AUTO_LOADING_MANIFEST_NUMBER_RE.test(manifestNumber.trim());
}

/** Подпись в списках и шапке: город/направление; свой номер — только если ввели вручную. */
export function formatLoadingManifestDisplayName(m: LoadingManifestLabelFields): string {
  const destination = m.destinationName.trim() || "—";
  const num = m.manifestNumber.trim();
  if (!num || isAutoGeneratedLoadingManifestNumber(num)) {
    return destination;
  }
  const destinationLower = destination.toLocaleLowerCase("ru-RU");
  const numberLower = num.toLocaleLowerCase("ru-RU");
  if (destinationLower && numberLower.includes(destinationLower)) {
    return `№ ${num}`;
  }
  return `${destination} · № ${num}`;
}

export type LoadingManifestTableLabelFields = LoadingManifestLabelFields & {
  docDate: string;
  tripLabel?: string;
};

function normalizeManifestLabelPart(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function isoDocDateToDotDate(docDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(docDate.trim());
  if (!m) {
    return null;
  }
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function shouldDropManifestTablePart(
  part: string,
  tripLabel: string,
  destination: string,
  docDate: string,
): boolean {
  const normalized = normalizeManifestLabelPart(part);
  if (!normalized) {
    return true;
  }
  if (normalized === normalizeManifestLabelPart(destination)) {
    return true;
  }
  if (normalized === normalizeManifestLabelPart(docDate)) {
    return true;
  }
  const dotDate = isoDocDateToDotDate(docDate);
  if (dotDate && normalized === normalizeManifestLabelPart(dotDate)) {
    return true;
  }
  const ruDate = formatPurchaseDocDateRu(docDate);
  if (ruDate !== "—" && normalized === normalizeManifestLabelPart(ruDate)) {
    return true;
  }
  const tripNorm = normalizeManifestLabelPart(tripLabel);
  if (tripNorm && tripNorm.includes(normalized)) {
    return true;
  }
  for (const tripPart of tripLabel.split("·").map((p) => normalizeManifestLabelPart(p)).filter(Boolean)) {
    if (tripPart === normalized) {
      return true;
    }
  }
  return false;
}

/** Короткая подпись № в таблице — без повтора рейса, даты и города из соседних колонок. */
export function formatLoadingManifestTableNumberLabel(m: LoadingManifestTableLabelFields): string {
  const num = m.manifestNumber.trim();
  if (!num || isAutoGeneratedLoadingManifestNumber(num)) {
    return "—";
  }

  const tripLabel = m.tripLabel?.trim() ?? "";
  const destination = m.destinationName.trim();
  const docDate = m.docDate.trim();
  const kept = num
    .split("·")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !shouldDropManifestTablePart(p, tripLabel, destination, docDate));

  if (kept.length === 0) {
    return "—";
  }
  return `№ ${kept.join(" · ")}`;
}

function uniquifyManifestNumber(base: string, taken: Set<string>): string {
  const trimmed = base.slice(0, 80);
  if (!taken.has(trimmed)) {
    return trimmed;
  }
  for (let n = 2; n < 1000; n++) {
    const suffix = ` (${n})`;
    const candidate = `${base.slice(0, Math.max(0, 80 - suffix.length))}${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  const tail = `${Date.now()}`.slice(-6);
  return `${base.slice(0, 73)}-${tail}`;
}

/** Номер для сохранения: рейс + дата (предпочтительно) или город + дата; без коллизий с уже занятыми. */
export function resolveLoadingManifestNumberForSave(params: {
  tripNumber?: string;
  destinationLabel: string;
  docDate: string;
  takenNumbers?: readonly string[];
}): string {
  const { tripNumber, destinationLabel, docDate, takenNumbers = [] } = params;
  const taken = new Set(takenNumbers.map((x) => x.trim()).filter(Boolean));
  const date = docDate.trim() || new Date().toISOString().slice(0, 10);
  const destination = destinationLabel.trim() || "Направление";
  const trip = tripNumber?.trim();
  const base = trip
    ? `${trip} · ${destination} · ${date}`
    : `${destination} · ${date}`;
  return uniquifyManifestNumber(base, taken);
}
