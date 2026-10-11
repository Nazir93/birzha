import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import type { DbClient } from "../db/client.js";
import {
  batches,
  purchaseDocumentLines,
  purchaseDocuments,
  supplierPayments,
  users,
  warehouses,
} from "../db/schema.js";

import { gramsToKg, toKopecksBigInt } from "./admin-dashboard-summary-map.js";

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ожидается дата YYYY-MM-DD");

export const purchaseByPurchaserReportQuerySchema = z
  .object({
    from: ymd,
    to: ymd,
  })
  .refine((q) => q.from <= q.to, { message: "from не позже to", path: ["to"] });

export type PurchaseByPurchaserReportQuery = z.infer<typeof purchaseByPurchaserReportQuerySchema>;

export type PurchaseByPurchaserReportOptions = {
  /** Только накладные этого закупщика (поле purchaser / fallback author). */
  onlyPurchaserUserId?: string;
};

export type PurchaseByPurchaserCell = {
  purchaserUserId: string | null;
  purchaserLogin: string;
  warehouseId: string;
  warehouseName: string;
  totalKg: number;
  packageCount: number;
  totalKopecks: string;
  documentCount: number;
  /** Кг ещё на складе (к погрузке) по партиям этих накладных. */
  onWarehouseKg: number;
  /** Оценка ящиков на складе (доля onWarehouse от строки). */
  onWarehousePackageCount: number;
  /** Накладные с остатком onWarehouse > 0. */
  documentsWithStockCount: number;
};

export type PurchaseByPurchaserTotals = {
  totalKg: number;
  packageCount: number;
  totalKopecks: string;
  documentCount: number;
  onWarehouseKg: number;
  onWarehousePackageCount: number;
  documentsWithStockCount: number;
  /** Оценка ₽ остатка на складе (доля onWarehouse × цена строки). */
  onWarehouseValueKopecks: string;
  paidKopecks: string;
  remainingPayableKopecks: string;
};

export type PurchaseByPurchaserSupplierRow = {
  supplierId: string | null;
  supplierName: string;
  totalKopecks: string;
  paidKopecks: string;
  remainingPayableKopecks: string;
  documentCount: number;
  documentsWithStockCount: number;
  onWarehouseKg: number;
  onWarehousePackageCount: number;
  onWarehouseValueKopecks: string;
};

export type PurchaseByPurchaserWarehouseSupplierRow = {
  warehouseId: string;
  warehouseName: string;
  supplierId: string | null;
  supplierName: string;
  onWarehouseKg: number;
  onWarehousePackageCount: number;
  onWarehouseValueKopecks: string;
  documentsWithStockCount: number;
};

export type PurchaseByPurchaserReport = {
  from: string;
  to: string;
  cells: PurchaseByPurchaserCell[];
  byPurchaser: Array<{
    purchaserUserId: string | null;
    purchaserLogin: string;
    totalKg: number;
    packageCount: number;
    totalKopecks: string;
    documentCount: number;
    onWarehouseKg: number;
    onWarehousePackageCount: number;
    documentsWithStockCount: number;
    onWarehouseValueKopecks: string;
    paidKopecks: string;
    remainingPayableKopecks: string;
  }>;
  byWarehouse: Array<{
    warehouseId: string;
    warehouseName: string;
    totalKg: number;
    packageCount: number;
    totalKopecks: string;
    documentCount: number;
    onWarehouseKg: number;
    onWarehousePackageCount: number;
    documentsWithStockCount: number;
    onWarehouseValueKopecks: string;
    paidKopecks: string;
    remainingPayableKopecks: string;
  }>;
  /** Бухгалтерия закупщика: по тепличникам — взял / отдал / осталось. */
  bySupplier: PurchaseByPurchaserSupplierRow[];
  /** Остаток на складе: склад × тепличник (для раскрытия строк). */
  byWarehouseSupplier: PurchaseByPurchaserWarehouseSupplierRow[];
  grand: PurchaseByPurchaserTotals;
};

type DocAggRow = {
  purchaserUserId: string | null;
  purchaserLogin: string | null;
  warehouseId: string;
  warehouseName: string;
  supplierId?: string | null;
  supplierName?: string | null;
  linesKopecks: unknown;
  extraKopecks: unknown;
  grams: unknown;
  packages: unknown;
  onWarehouseGrams?: unknown;
  onWarehousePackages?: unknown;
  onWarehouseValueKopecks?: unknown;
  paidKopecks?: unknown;
};

function metricFromParts(linesKop: unknown, extraKop: unknown, grams: unknown, packages: unknown) {
  const totalKopecks = toKopecksBigInt(linesKop) + toKopecksBigInt(extraKop);
  const g = typeof grams === "bigint" ? grams : toKopecksBigInt(grams);
  const pkg =
    typeof packages === "bigint"
      ? Number(packages)
      : typeof packages === "number"
        ? packages
        : Number(toKopecksBigInt(packages));
  return {
    totalKg: gramsToKg(g),
    packageCount: Number.isFinite(pkg) ? Math.trunc(pkg) : 0,
    totalKopecks: totalKopecks.toString(),
  };
}

type AccTotals = {
  totalKg: number;
  packageCount: number;
  totalKopecks: bigint;
  documentCount: number;
  onWarehouseKg: number;
  onWarehousePackageCount: number;
  documentsWithStockCount: number;
  onWarehouseValueKopecks: bigint;
  paidKopecks: bigint;
};

function emptyTotals(): AccTotals {
  return {
    totalKg: 0,
    packageCount: 0,
    totalKopecks: 0n,
    documentCount: 0,
    onWarehouseKg: 0,
    onWarehousePackageCount: 0,
    documentsWithStockCount: 0,
    onWarehouseValueKopecks: 0n,
    paidKopecks: 0n,
  };
}

function addInto(
  acc: AccTotals,
  part: {
    totalKg: number;
    packageCount: number;
    totalKopecks: bigint;
    onWarehouseKg: number;
    onWarehousePackageCount: number;
    documentsWithStockCount: number;
    onWarehouseValueKopecks: bigint;
    paidKopecks: bigint;
  },
  documentCount = 1,
): void {
  acc.totalKg += part.totalKg;
  acc.packageCount += part.packageCount;
  acc.totalKopecks += part.totalKopecks;
  acc.documentCount += documentCount;
  acc.onWarehouseKg += part.onWarehouseKg;
  acc.onWarehousePackageCount += part.onWarehousePackageCount;
  acc.documentsWithStockCount += part.documentsWithStockCount;
  acc.onWarehouseValueKopecks += part.onWarehouseValueKopecks;
  acc.paidKopecks += part.paidKopecks;
}

function finalizeTotals(acc: AccTotals): PurchaseByPurchaserTotals {
  const remaining =
    acc.totalKopecks > acc.paidKopecks ? acc.totalKopecks - acc.paidKopecks : 0n;
  return {
    totalKg: acc.totalKg,
    packageCount: acc.packageCount,
    totalKopecks: acc.totalKopecks.toString(),
    documentCount: acc.documentCount,
    onWarehouseKg: acc.onWarehouseKg,
    onWarehousePackageCount: Math.round(acc.onWarehousePackageCount),
    documentsWithStockCount: acc.documentsWithStockCount,
    onWarehouseValueKopecks: acc.onWarehouseValueKopecks.toString(),
    paidKopecks: acc.paidKopecks.toString(),
    remainingPayableKopecks: remaining.toString(),
  };
}

function stockFromDocRow(row: DocAggRow): {
  onWarehouseKg: number;
  onWarehousePackageCount: number;
  documentsWithStockCount: number;
  onWarehouseValueKopecks: bigint;
  paidKopecks: bigint;
} {
  const whG =
    typeof row.onWarehouseGrams === "bigint"
      ? row.onWarehouseGrams
      : toKopecksBigInt(row.onWarehouseGrams);
  const onWarehouseKg = gramsToKg(whG);
  const pkgRaw = row.onWarehousePackages;
  const onWarehousePackageCount =
    typeof pkgRaw === "number"
      ? pkgRaw
      : typeof pkgRaw === "bigint"
        ? Number(pkgRaw)
        : Number(toKopecksBigInt(pkgRaw));
  return {
    onWarehouseKg,
    onWarehousePackageCount: Number.isFinite(onWarehousePackageCount) ? onWarehousePackageCount : 0,
    documentsWithStockCount: whG > 0n ? 1 : 0,
    onWarehouseValueKopecks: toKopecksBigInt(row.onWarehouseValueKopecks),
    paidKopecks: toKopecksBigInt(row.paidKopecks),
  };
}

/** Сборка отчёта из построчных агрегатов по накладным (для unit-тестов без БД). */
export function buildPurchaseByPurchaserReport(
  from: string,
  to: string,
  docRows: DocAggRow[],
): PurchaseByPurchaserReport {
  const cellMap = new Map<
    string,
    {
      purchaserUserId: string | null;
      purchaserLogin: string;
      warehouseId: string;
      warehouseName: string;
      totalKg: number;
      packageCount: number;
      totalKopecks: bigint;
      documentCount: number;
      onWarehouseKg: number;
      onWarehousePackageCount: number;
      documentsWithStockCount: number;
    }
  >();

  const bySupplierMap = new Map<
    string,
    {
      supplierId: string | null;
      supplierName: string;
      totalKopecks: bigint;
      paidKopecks: bigint;
      documentCount: number;
      documentsWithStockCount: number;
      onWarehouseKg: number;
      onWarehousePackageCount: number;
      onWarehouseValueKopecks: bigint;
    }
  >();
  const byWarehouseSupplierMap = new Map<
    string,
    {
      warehouseId: string;
      warehouseName: string;
      supplierId: string | null;
      supplierName: string;
      onWarehouseKg: number;
      onWarehousePackageCount: number;
      onWarehouseValueKopecks: bigint;
      documentsWithStockCount: number;
    }
  >();

  for (const row of docRows) {
    const purchaserUserId = row.purchaserUserId;
    const purchaserLogin = row.purchaserLogin?.trim() || (purchaserUserId ? purchaserUserId : "Без автора");
    const key = `${purchaserUserId ?? ""}::${row.warehouseId}`;
    const m = metricFromParts(row.linesKopecks, row.extraKopecks, row.grams, row.packages);
    const stock = stockFromDocRow(row);
    const existing = cellMap.get(key);
    if (existing) {
      existing.totalKg += m.totalKg;
      existing.packageCount += m.packageCount;
      existing.totalKopecks += BigInt(m.totalKopecks);
      existing.documentCount += 1;
      existing.onWarehouseKg += stock.onWarehouseKg;
      existing.onWarehousePackageCount += stock.onWarehousePackageCount;
      existing.documentsWithStockCount += stock.documentsWithStockCount;
    } else {
      cellMap.set(key, {
        purchaserUserId,
        purchaserLogin,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        totalKg: m.totalKg,
        packageCount: m.packageCount,
        totalKopecks: BigInt(m.totalKopecks),
        documentCount: 1,
        onWarehouseKg: stock.onWarehouseKg,
        onWarehousePackageCount: stock.onWarehousePackageCount,
        documentsWithStockCount: stock.documentsWithStockCount,
      });
    }

    const supplierId = row.supplierId?.trim() || null;
    const supplierName = (row.supplierName ?? "").trim() || "Без тепличника";
    const sk = `${supplierId ?? ""}::${supplierName}`;
    let sup = bySupplierMap.get(sk);
    if (!sup) {
      sup = {
        supplierId,
        supplierName,
        totalKopecks: 0n,
        paidKopecks: 0n,
        documentCount: 0,
        documentsWithStockCount: 0,
        onWarehouseKg: 0,
        onWarehousePackageCount: 0,
        onWarehouseValueKopecks: 0n,
      };
      bySupplierMap.set(sk, sup);
    }
    sup.totalKopecks += BigInt(m.totalKopecks);
    sup.paidKopecks += stock.paidKopecks;
    sup.documentCount += 1;
    sup.documentsWithStockCount += stock.documentsWithStockCount;
    sup.onWarehouseKg += stock.onWarehouseKg;
    sup.onWarehousePackageCount += stock.onWarehousePackageCount;
    sup.onWarehouseValueKopecks += stock.onWarehouseValueKopecks;

    if (stock.onWarehouseKg > 0 || stock.onWarehousePackageCount > 0) {
      const wsk = `${row.warehouseId}::${sk}`;
      let ws = byWarehouseSupplierMap.get(wsk);
      if (!ws) {
        ws = {
          warehouseId: row.warehouseId,
          warehouseName: row.warehouseName,
          supplierId,
          supplierName,
          onWarehouseKg: 0,
          onWarehousePackageCount: 0,
          onWarehouseValueKopecks: 0n,
          documentsWithStockCount: 0,
        };
        byWarehouseSupplierMap.set(wsk, ws);
      }
      ws.onWarehouseKg += stock.onWarehouseKg;
      ws.onWarehousePackageCount += stock.onWarehousePackageCount;
      ws.onWarehouseValueKopecks += stock.onWarehouseValueKopecks;
      ws.documentsWithStockCount += stock.documentsWithStockCount;
    }
  }

  const cells: PurchaseByPurchaserCell[] = [...cellMap.values()]
    .map((c) => ({
      purchaserUserId: c.purchaserUserId,
      purchaserLogin: c.purchaserLogin,
      warehouseId: c.warehouseId,
      warehouseName: c.warehouseName,
      totalKg: c.totalKg,
      packageCount: c.packageCount,
      totalKopecks: c.totalKopecks.toString(),
      documentCount: c.documentCount,
      onWarehouseKg: c.onWarehouseKg,
      onWarehousePackageCount: Math.round(c.onWarehousePackageCount),
      documentsWithStockCount: c.documentsWithStockCount,
    }))
    .sort((a, b) => {
      const pl = a.purchaserLogin.localeCompare(b.purchaserLogin, "ru");
      if (pl !== 0) {
        return pl;
      }
      return a.warehouseName.localeCompare(b.warehouseName, "ru");
    });

  const byPurchaserMap = new Map<string, AccTotals & { purchaserUserId: string | null; purchaserLogin: string }>();
  const byWarehouseMap = new Map<string, AccTotals & { warehouseId: string; warehouseName: string }>();
  const grand = emptyTotals();

  for (const row of docRows) {
    const m = metricFromParts(row.linesKopecks, row.extraKopecks, row.grams, row.packages);
    const stock = stockFromDocRow(row);
    const part = {
      totalKg: m.totalKg,
      packageCount: m.packageCount,
      totalKopecks: BigInt(m.totalKopecks),
      onWarehouseKg: stock.onWarehouseKg,
      onWarehousePackageCount: stock.onWarehousePackageCount,
      documentsWithStockCount: stock.documentsWithStockCount,
      onWarehouseValueKopecks: stock.onWarehouseValueKopecks,
      paidKopecks: stock.paidKopecks,
    };
    addInto(grand, part, 1);

    const purchaserUserId = row.purchaserUserId;
    const purchaserLogin = row.purchaserLogin?.trim() || (purchaserUserId ? purchaserUserId : "Без автора");
    const pk = purchaserUserId ?? "";
    let p = byPurchaserMap.get(pk);
    if (!p) {
      p = { ...emptyTotals(), purchaserUserId, purchaserLogin };
      byPurchaserMap.set(pk, p);
    }
    addInto(p, part, 1);

    let w = byWarehouseMap.get(row.warehouseId);
    if (!w) {
      w = { ...emptyTotals(), warehouseId: row.warehouseId, warehouseName: row.warehouseName };
      byWarehouseMap.set(row.warehouseId, w);
    }
    addInto(w, part, 1);
  }

  return {
    from,
    to,
    cells,
    byPurchaser: [...byPurchaserMap.values()]
      .map((p) => ({
        purchaserUserId: p.purchaserUserId,
        purchaserLogin: p.purchaserLogin,
        ...finalizeTotals(p),
      }))
      .sort((a, b) => a.purchaserLogin.localeCompare(b.purchaserLogin, "ru")),
    byWarehouse: [...byWarehouseMap.values()]
      .map((w) => ({
        warehouseId: w.warehouseId,
        warehouseName: w.warehouseName,
        ...finalizeTotals(w),
      }))
      .sort((a, b) => a.warehouseName.localeCompare(b.warehouseName, "ru")),
    bySupplier: [...bySupplierMap.values()]
      .map((s) => {
        const remaining = s.totalKopecks > s.paidKopecks ? s.totalKopecks - s.paidKopecks : 0n;
        return {
          supplierId: s.supplierId,
          supplierName: s.supplierName,
          totalKopecks: s.totalKopecks.toString(),
          paidKopecks: s.paidKopecks.toString(),
          remainingPayableKopecks: remaining.toString(),
          documentCount: s.documentCount,
          documentsWithStockCount: s.documentsWithStockCount,
          onWarehouseKg: s.onWarehouseKg,
          onWarehousePackageCount: Math.round(s.onWarehousePackageCount),
          onWarehouseValueKopecks: s.onWarehouseValueKopecks.toString(),
        };
      })
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName, "ru")),
    byWarehouseSupplier: [...byWarehouseSupplierMap.values()]
      .map((r) => ({
        warehouseId: r.warehouseId,
        warehouseName: r.warehouseName,
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        onWarehouseKg: r.onWarehouseKg,
        onWarehousePackageCount: Math.round(r.onWarehousePackageCount),
        onWarehouseValueKopecks: r.onWarehouseValueKopecks.toString(),
        documentsWithStockCount: r.documentsWithStockCount,
      }))
      .sort(
        (a, b) =>
          a.warehouseName.localeCompare(b.warehouseName, "ru") ||
          a.supplierName.localeCompare(b.supplierName, "ru"),
      ),
    grand: finalizeTotals(grand),
  };
}

export async function getPurchaseByPurchaserReport(
  db: DbClient,
  query: PurchaseByPurchaserReportQuery,
  options?: PurchaseByPurchaserReportOptions,
): Promise<PurchaseByPurchaserReport> {
  const fromDate = new Date(`${query.from}T00:00:00.000Z`);
  const toDate = new Date(`${query.to}T00:00:00.000Z`);
  const onlyId = options?.onlyPurchaserUserId?.trim();

  const effectivePurchaser = sql`coalesce(${purchaseDocuments.purchaserUserId}, ${purchaseDocuments.createdByUserId})`;

  const periodFilters = [
    gte(purchaseDocuments.docDate, fromDate),
    lte(purchaseDocuments.docDate, toDate),
  ] as const;
  const where =
    onlyId && onlyId.length > 0
      ? and(...periodFilters, sql`${effectivePurchaser} = ${onlyId}`)
      : and(...periodFilters);

  const paidByDoc = sql`coalesce((
    select sum(${supplierPayments.amountKopecks})
    from ${supplierPayments}
    where ${supplierPayments.purchaseDocumentId} = ${purchaseDocuments.id}
  ), 0)`;

  const rows = await db
    .select({
      purchaserUserId: sql<string | null>`${effectivePurchaser}`,
      purchaserLogin: users.login,
      warehouseId: purchaseDocuments.warehouseId,
      warehouseName: warehouses.name,
      supplierId: purchaseDocuments.supplierId,
      supplierName: purchaseDocuments.supplierName,
      linesKopecks: sql`coalesce(sum(${purchaseDocumentLines.lineTotalKopecks}), 0)`,
      extraKopecks: purchaseDocuments.extraCostKopecks,
      grams: sql`coalesce(sum(${purchaseDocumentLines.quantityGrams}), 0)`,
      packages: sql`coalesce(sum(coalesce(${purchaseDocumentLines.packageCount}, 0)), 0)`,
      onWarehouseGrams: sql`coalesce(sum(${batches.onWarehouseGrams}), 0)`,
      onWarehousePackages: sql`coalesce(sum(
        case when ${batches.totalGrams} > 0 then
          ${batches.onWarehouseGrams}::numeric / ${batches.totalGrams}::numeric
            * coalesce(${purchaseDocumentLines.packageCount}, 0)
        else 0 end
      ), 0)::float`,
      onWarehouseValueKopecks: sql`coalesce(sum((
        ${batches.onWarehouseGrams}::numeric * ${purchaseDocumentLines.pricePerKg} * 100 / 1000
      )::bigint), 0)`,
      paidKopecks: paidByDoc,
    })
    .from(purchaseDocuments)
    .innerJoin(warehouses, eq(warehouses.id, purchaseDocuments.warehouseId))
    .leftJoin(users, eq(users.id, effectivePurchaser))
    .leftJoin(purchaseDocumentLines, eq(purchaseDocumentLines.documentId, purchaseDocuments.id))
    .leftJoin(batches, eq(batches.id, purchaseDocumentLines.batchId))
    .where(where)
    .groupBy(
      purchaseDocuments.id,
      effectivePurchaser,
      users.login,
      purchaseDocuments.warehouseId,
      warehouses.name,
      purchaseDocuments.supplierId,
      purchaseDocuments.supplierName,
      purchaseDocuments.extraCostKopecks,
    );

  return buildPurchaseByPurchaserReport(
    query.from,
    query.to,
    rows.map((r) => ({
      purchaserUserId: r.purchaserUserId,
      purchaserLogin: r.purchaserLogin,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      linesKopecks: r.linesKopecks,
      extraKopecks: r.extraKopecks,
      grams: r.grams,
      packages: r.packages,
      onWarehouseGrams: r.onWarehouseGrams,
      onWarehousePackages: r.onWarehousePackages,
      onWarehouseValueKopecks: r.onWarehouseValueKopecks,
      paidKopecks: r.paidKopecks,
    })),
  );
}
