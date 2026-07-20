import { randomUUID } from "node:crypto";

import { Batch } from "@birzha/domain";
import {
  type CreatePurchaseDocumentBody,
  numberToDecimalStringForKopecks,
  purchaseLineAmountKopecksFromDecimalStrings,
} from "@birzha/contracts";

import {
  ProductGradeNotFoundError,
  PurchaseLineTotalMismatchError,
  SupplierNotFoundError,
  WarehouseNotFoundError,
} from "../errors.js";
import type { ProductGradeRepository } from "../ports/product-grade-repository.port.js";
import type {
  NewPurchaseDocumentLine,
  PurchaseDocumentHeaderRow,
  PurchaseDocumentRepository,
} from "../ports/purchase-document-repository.port.js";
import type { SupplierRepository } from "../ports/supplier-repository.port.js";
import type { WarehouseRepository } from "../ports/warehouse-repository.port.js";
import { resolvePurchaseLineMass } from "./resolve-purchase-line-mass.js";

function expectedLineKopecks(totalKg: number, pricePerKg: number): number {
  return purchaseLineAmountKopecksFromDecimalStrings(
    numberToDecimalStringForKopecks(totalKg, 6),
    numberToDecimalStringForKopecks(pricePerKg, 4),
  );
}

function lineTotalsMatch(expected: number, actual: number): boolean {
  return Math.abs(expected - actual) <= 1;
}

export class CreatePurchaseDocumentUseCase {
  constructor(
    private readonly warehouses: WarehouseRepository,
    private readonly grades: ProductGradeRepository,
    private readonly purchaseDocuments: PurchaseDocumentRepository,
    private readonly suppliers: SupplierRepository | null = null,
  ) {}

  async execute(
    body: CreatePurchaseDocumentBody,
    ctx?: { createdByUserId?: string | null },
  ): Promise<{ documentId: string }> {
    const documentId = body.id ?? randomUUID();

    const wh = await this.warehouses.findById(body.warehouseId);
    if (!wh) {
      throw new WarehouseNotFoundError(body.warehouseId);
    }

    let supplierId: string | null = body.supplierId?.trim() || null;
    let supplierName = body.supplierName?.trim() || null;
    if (supplierId) {
      if (!this.suppliers) {
        throw new SupplierNotFoundError(supplierId);
      }
      const supplier = await this.suppliers.findActiveById(supplierId);
      if (!supplier) {
        throw new SupplierNotFoundError(supplierId);
      }
      supplierName = supplier.name;
    }

    const createdBy = ctx?.createdByUserId?.trim();
    const header: PurchaseDocumentHeaderRow = {
      id: documentId,
      documentNumber: body.documentNumber.trim(),
      docDate: parseIsoDateOnly(body.docDate),
      supplierName,
      supplierId,
      buyerLabel: body.buyerLabel?.trim() || null,
      warehouseId: body.warehouseId,
      extraCostKopecks: BigInt(body.extraCostKopecks ?? 0),
      createdByUserId: createdBy && createdBy.length > 0 ? createdBy : null,
    };

    const lines: NewPurchaseDocumentLine[] = [];

    for (let i = 0; i < body.lines.length; i++) {
      const row = body.lines[i]!;
      const grade = await this.grades.findById(row.productGradeId);
      if (!grade) {
        throw new ProductGradeNotFoundError(row.productGradeId);
      }

      const mass = resolvePurchaseLineMass({
        grossKg: row.grossKg,
        packageCount: row.packageCount,
      });

      const expected = expectedLineKopecks(mass.netKg, row.pricePerKg);
      if (!lineTotalsMatch(expected, row.lineTotalKopecks)) {
        throw new PurchaseLineTotalMismatchError(i, expected, row.lineTotalKopecks);
      }

      const batchId = randomUUID();
      const batch = Batch.create({
        id: batchId,
        purchaseId: documentId,
        totalKg: mass.netKg,
        pricePerKg: row.pricePerKg,
        distribution: "on_hand",
        warehouseId: body.warehouseId,
      });

      lines.push({
        id: randomUUID(),
        lineNo: i + 1,
        productGradeId: row.productGradeId,
        quantityGrams: mass.netGrams,
        grossQuantityGrams: mass.grossGrams,
        packageCount: mass.packageCount,
        pricePerKgNumeric: row.pricePerKg.toFixed(6),
        lineTotalKopecks: BigInt(row.lineTotalKopecks),
        batch,
      });
    }

    await this.purchaseDocuments.insertDocumentWithLines(header, lines);
    return { documentId };
  }
}

function parseIsoDateOnly(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(iso);
  }
  return new Date(`${iso}T12:00:00.000Z`);
}
