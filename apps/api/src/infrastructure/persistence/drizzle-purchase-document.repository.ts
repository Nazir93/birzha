import { asc, count, desc, eq } from "drizzle-orm";

import type {
  NewPurchaseDocumentLine,
  PurchaseDocumentDetail,
  PurchaseDocumentHeaderRow,
  PurchaseDocumentRepository,
  PurchaseDocumentSummary,
} from "../../application/ports/purchase-document-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { productGrades, purchaseDocumentLines, purchaseDocuments } from "../../db/schema.js";
import { gramsToKg } from "./batch-mass.js";

import { DrizzleBatchRepository } from "./drizzle-batch.repository.js";

export class DrizzlePurchaseDocumentRepository implements PurchaseDocumentRepository {
  constructor(private readonly db: DbClient) {}

  async insertDocumentWithLines(header: PurchaseDocumentHeaderRow, lines: NewPurchaseDocumentLine[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      const exec = tx as unknown as DbClient;
      const batchRepo = new DrizzleBatchRepository(exec);

      await exec.insert(purchaseDocuments).values({
        id: header.id,
        documentNumber: header.documentNumber,
        docDate: header.docDate,
        supplierName: header.supplierName,
        buyerLabel: header.buyerLabel,
        warehouseId: header.warehouseId,
        extraCostKopecks: header.extraCostKopecks,
      });

      for (const line of lines) {
        await batchRepo.save(line.batch);
        await exec.insert(purchaseDocumentLines).values({
          id: line.id,
          documentId: header.id,
          lineNo: line.lineNo,
          productGradeId: line.productGradeId,
          quantityGrams: line.quantityGrams,
          packageCount: line.packageCount,
          pricePerKg: line.pricePerKgNumeric,
          lineTotalKopecks: line.lineTotalKopecks,
          batchId: line.batch.getId(),
        });
      }
    });
  }

  async listSummaries(): Promise<PurchaseDocumentSummary[]> {
    const docs = await this.db.select().from(purchaseDocuments).orderBy(desc(purchaseDocuments.createdAt));

    const counts =
      docs.length === 0
        ? []
        : await this.db
            .select({
              documentId: purchaseDocumentLines.documentId,
              c: count(),
            })
            .from(purchaseDocumentLines)
            .groupBy(purchaseDocumentLines.documentId);

    const countMap = new Map(counts.map((row) => [row.documentId, Number(row.c)]));

    return docs.map((d) => ({
      id: d.id,
      documentNumber: d.documentNumber,
      docDate: formatPgDate(d.docDate),
      warehouseId: d.warehouseId,
      lineCount: countMap.get(d.id) ?? 0,
    }));
  }

  async findByIdWithLines(id: string): Promise<PurchaseDocumentDetail | null> {
    const docRows = await this.db.select().from(purchaseDocuments).where(eq(purchaseDocuments.id, id)).limit(1);
    const doc = docRows[0];
    if (!doc) {
      return null;
    }

    const lineRows = await this.db
      .select({
        line: purchaseDocumentLines,
        gradeCode: productGrades.code,
      })
      .from(purchaseDocumentLines)
      .innerJoin(productGrades, eq(purchaseDocumentLines.productGradeId, productGrades.id))
      .where(eq(purchaseDocumentLines.documentId, id))
      .orderBy(asc(purchaseDocumentLines.lineNo));

    return {
      id: doc.id,
      documentNumber: doc.documentNumber,
      docDate: formatPgDate(doc.docDate),
      supplierName: doc.supplierName,
      buyerLabel: doc.buyerLabel,
      warehouseId: doc.warehouseId,
      extraCostKopecks: doc.extraCostKopecks.toString(),
      createdAt: doc.createdAt.toISOString(),
      lines: lineRows.map(({ line, gradeCode }) => ({
        lineNo: line.lineNo,
        productGradeId: line.productGradeId,
        productGradeCode: gradeCode,
        batchId: line.batchId,
        totalKg: gramsToKg(line.quantityGrams),
        packageCount: line.packageCount === null ? null : line.packageCount.toString(),
        pricePerKg: Number(line.pricePerKg),
        lineTotalKopecks: line.lineTotalKopecks.toString(),
      })),
    };
  }
}

function formatPgDate(d: Date): string {
  const iso = d.toISOString();
  return iso.slice(0, 10);
}
