import type { BatchRepository } from "../../application/ports/batch-repository.port.js";
import type { ProductGradeRepository } from "../../application/ports/product-grade-repository.port.js";
import type {
  NewPurchaseDocumentLine,
  PurchaseDocumentDetail,
  PurchaseDocumentHeaderRow,
  PurchaseDocumentRepository,
  PurchaseDocumentSummary,
} from "../../application/ports/purchase-document-repository.port.js";
import { gramsToKg } from "./batch-mass.js";

export class InMemoryPurchaseDocumentRepository implements PurchaseDocumentRepository {
  private readonly headers: PurchaseDocumentHeaderRow[] = [];
  private readonly linesByDoc = new Map<string, NewPurchaseDocumentLine[]>();

  constructor(
    private readonly batches: BatchRepository,
    private readonly grades: ProductGradeRepository,
  ) {}

  async insertDocumentWithLines(header: PurchaseDocumentHeaderRow, lines: NewPurchaseDocumentLine[]): Promise<void> {
    for (const line of lines) {
      await this.batches.save(line.batch);
    }
    this.headers.push(header);
    this.linesByDoc.set(header.id, lines);
  }

  async listSummaries(): Promise<PurchaseDocumentSummary[]> {
    return this.headers
      .map((d) => ({
        id: d.id,
        documentNumber: d.documentNumber,
        docDate: formatHeaderDate(d.docDate),
        warehouseId: d.warehouseId,
        lineCount: this.linesByDoc.get(d.id)?.length ?? 0,
      }))
      .sort((a, b) => b.id.localeCompare(a.id));
  }

  async findByIdWithLines(id: string): Promise<PurchaseDocumentDetail | null> {
    const header = this.headers.find((h) => h.id === id);
    const lines = this.linesByDoc.get(id);
    if (!header || !lines) {
      return null;
    }

    const detailLines = [];
    for (const line of lines) {
      const grade = await this.grades.findById(line.productGradeId);
      detailLines.push({
        lineNo: line.lineNo,
        productGradeId: line.productGradeId,
        productGradeCode: grade?.code ?? line.productGradeId,
        batchId: line.batch.getId(),
        totalKg: gramsToKg(line.quantityGrams),
        packageCount: line.packageCount === null ? null : line.packageCount.toString(),
        pricePerKg: Number(line.pricePerKgNumeric),
        lineTotalKopecks: line.lineTotalKopecks.toString(),
      });
    }

    return {
      id: header.id,
      documentNumber: header.documentNumber,
      docDate: formatHeaderDate(header.docDate),
      supplierName: header.supplierName,
      buyerLabel: header.buyerLabel,
      warehouseId: header.warehouseId,
      extraCostKopecks: header.extraCostKopecks.toString(),
      createdAt: null,
      lines: detailLines,
    };
  }
}

function formatHeaderDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
