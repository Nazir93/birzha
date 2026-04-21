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
  WarehouseNotFoundError,
} from "../errors.js";
import type { ProductGradeRepository } from "../ports/product-grade-repository.port.js";
import type {
  NewPurchaseDocumentLine,
  PurchaseDocumentHeaderRow,
  PurchaseDocumentRepository,
} from "../ports/purchase-document-repository.port.js";
import type { WarehouseRepository } from "../ports/warehouse-repository.port.js";

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
  ) {}

  async execute(body: CreatePurchaseDocumentBody): Promise<{ documentId: string }> {
    const documentId = body.id ?? randomUUID();

    const wh = await this.warehouses.findById(body.warehouseId);
    if (!wh) {
      throw new WarehouseNotFoundError(body.warehouseId);
    }

    const header: PurchaseDocumentHeaderRow = {
      id: documentId,
      documentNumber: body.documentNumber.trim(),
      docDate: parseIsoDateOnly(body.docDate),
      supplierName: body.supplierName?.trim() || null,
      buyerLabel: body.buyerLabel?.trim() || null,
      warehouseId: body.warehouseId,
      extraCostKopecks: BigInt(body.extraCostKopecks ?? 0),
    };

    const lines: NewPurchaseDocumentLine[] = [];

    for (let i = 0; i < body.lines.length; i++) {
      const row = body.lines[i]!;
      const grade = await this.grades.findById(row.productGradeId);
      if (!grade) {
        throw new ProductGradeNotFoundError(row.productGradeId);
      }

      const expected = expectedLineKopecks(row.totalKg, row.pricePerKg);
      if (!lineTotalsMatch(expected, row.lineTotalKopecks)) {
        throw new PurchaseLineTotalMismatchError(i, expected, row.lineTotalKopecks);
      }

      const batchId = randomUUID();
      const batch = Batch.create({
        id: batchId,
        purchaseId: documentId,
        totalKg: row.totalKg,
        pricePerKg: row.pricePerKg,
        distribution: "on_hand",
        warehouseId: body.warehouseId,
      });

      const grams = BigInt(Math.round(row.totalKg * 1000));
      const pkg =
        row.packageCount === undefined ? null : BigInt(Math.max(0, Math.floor(row.packageCount)));

      lines.push({
        id: randomUUID(),
        lineNo: i + 1,
        productGradeId: row.productGradeId,
        quantityGrams: grams,
        packageCount: pkg,
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
