import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import type { DbClient } from "../db/client.js";
import {
  purchaseDocumentLines,
  purchaseDocuments,
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

export type PurchaseByPurchaserCell = {
  purchaserUserId: string | null;
  purchaserLogin: string;
  warehouseId: string;
  warehouseName: string;
  totalKg: number;
  packageCount: number;
  totalKopecks: string;
  documentCount: number;
};

export type PurchaseByPurchaserTotals = {
  totalKg: number;
  packageCount: number;
  totalKopecks: string;
  documentCount: number;
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
  }>;
  byWarehouse: Array<{
    warehouseId: string;
    warehouseName: string;
    totalKg: number;
    packageCount: number;
    totalKopecks: string;
    documentCount: number;
  }>;
  grand: PurchaseByPurchaserTotals;
};

type DocAggRow = {
  purchaserUserId: string | null;
  purchaserLogin: string | null;
  warehouseId: string;
  warehouseName: string;
  linesKopecks: unknown;
  extraKopecks: unknown;
  grams: unknown;
  packages: unknown;
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

function emptyTotals(): { totalKg: number; packageCount: number; totalKopecks: bigint; documentCount: number } {
  return { totalKg: 0, packageCount: 0, totalKopecks: 0n, documentCount: 0 };
}

function addInto(
  acc: { totalKg: number; packageCount: number; totalKopecks: bigint; documentCount: number },
  part: { totalKg: number; packageCount: number; totalKopecks: bigint },
  documentCount = 1,
): void {
  acc.totalKg += part.totalKg;
  acc.packageCount += part.packageCount;
  acc.totalKopecks += part.totalKopecks;
  acc.documentCount += documentCount;
}

function finalizeTotals(acc: {
  totalKg: number;
  packageCount: number;
  totalKopecks: bigint;
  documentCount: number;
}): PurchaseByPurchaserTotals {
  return {
    totalKg: acc.totalKg,
    packageCount: acc.packageCount,
    totalKopecks: acc.totalKopecks.toString(),
    documentCount: acc.documentCount,
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
    }
  >();

  for (const row of docRows) {
    const purchaserUserId = row.purchaserUserId;
    const purchaserLogin = row.purchaserLogin?.trim() || (purchaserUserId ? purchaserUserId : "Без автора");
    const key = `${purchaserUserId ?? ""}::${row.warehouseId}`;
    const m = metricFromParts(row.linesKopecks, row.extraKopecks, row.grams, row.packages);
    const existing = cellMap.get(key);
    if (existing) {
      existing.totalKg += m.totalKg;
      existing.packageCount += m.packageCount;
      existing.totalKopecks += BigInt(m.totalKopecks);
      existing.documentCount += 1;
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
      });
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
    }))
    .sort((a, b) => {
      const pl = a.purchaserLogin.localeCompare(b.purchaserLogin, "ru");
      if (pl !== 0) {
        return pl;
      }
      return a.warehouseName.localeCompare(b.warehouseName, "ru");
    });

  const byPurchaserMap = new Map<string, ReturnType<typeof emptyTotals> & { purchaserUserId: string | null; purchaserLogin: string }>();
  const byWarehouseMap = new Map<string, ReturnType<typeof emptyTotals> & { warehouseId: string; warehouseName: string }>();
  const grand = emptyTotals();

  for (const c of cells) {
    const kop = BigInt(c.totalKopecks);
    const part = { totalKg: c.totalKg, packageCount: c.packageCount, totalKopecks: kop };
    addInto(grand, part, c.documentCount);

    const pk = c.purchaserUserId ?? "";
    let p = byPurchaserMap.get(pk);
    if (!p) {
      p = { ...emptyTotals(), purchaserUserId: c.purchaserUserId, purchaserLogin: c.purchaserLogin };
      byPurchaserMap.set(pk, p);
    }
    addInto(p, part, c.documentCount);

    let w = byWarehouseMap.get(c.warehouseId);
    if (!w) {
      w = { ...emptyTotals(), warehouseId: c.warehouseId, warehouseName: c.warehouseName };
      byWarehouseMap.set(c.warehouseId, w);
    }
    addInto(w, part, c.documentCount);
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
    grand: finalizeTotals(grand),
  };
}

export async function getPurchaseByPurchaserReport(
  db: DbClient,
  query: PurchaseByPurchaserReportQuery,
): Promise<PurchaseByPurchaserReport> {
  const fromDate = new Date(`${query.from}T00:00:00.000Z`);
  const toDate = new Date(`${query.to}T00:00:00.000Z`);

  const rows = await db
    .select({
      purchaserUserId: sql<string | null>`coalesce(${purchaseDocuments.purchaserUserId}, ${purchaseDocuments.createdByUserId})`,
      purchaserLogin: users.login,
      warehouseId: purchaseDocuments.warehouseId,
      warehouseName: warehouses.name,
      linesKopecks: sql`coalesce(sum(${purchaseDocumentLines.lineTotalKopecks}), 0)`,
      extraKopecks: purchaseDocuments.extraCostKopecks,
      grams: sql`coalesce(sum(${purchaseDocumentLines.quantityGrams}), 0)`,
      packages: sql`coalesce(sum(coalesce(${purchaseDocumentLines.packageCount}, 0)), 0)`,
    })
    .from(purchaseDocuments)
    .innerJoin(warehouses, eq(warehouses.id, purchaseDocuments.warehouseId))
    .leftJoin(
      users,
      eq(users.id, sql`coalesce(${purchaseDocuments.purchaserUserId}, ${purchaseDocuments.createdByUserId})`),
    )
    .leftJoin(purchaseDocumentLines, eq(purchaseDocumentLines.documentId, purchaseDocuments.id))
    .where(and(gte(purchaseDocuments.docDate, fromDate), lte(purchaseDocuments.docDate, toDate)))
    .groupBy(
      purchaseDocuments.id,
      sql`coalesce(${purchaseDocuments.purchaserUserId}, ${purchaseDocuments.createdByUserId})`,
      users.login,
      purchaseDocuments.warehouseId,
      warehouses.name,
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
      linesKopecks: r.linesKopecks,
      extraKopecks: r.extraKopecks,
      grams: r.grams,
      packages: r.packages,
    })),
  );
}
