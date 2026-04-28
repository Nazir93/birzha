import { PurchaseDocumentNotFoundError } from "../../application/errors.js";
import type { BatchRepository } from "../../application/ports/batch-repository.port.js";
import type { ProductGradeRepository } from "../../application/ports/product-grade-repository.port.js";
import type {
  NewPurchaseDocumentLine,
  PurchaseDocumentDetail,
  PurchaseDocumentHeaderRow,
  PurchaseDocumentRepository,
  PurchaseDocumentSummary,
} from "../../application/ports/purchase-document-repository.port.js";
import type { TripSaleRepository } from "../../application/ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../../application/ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../../application/ports/trip-shortage-repository.port.js";
import { gramsToKg } from "./batch-mass.js";

export class InMemoryPurchaseDocumentRepository implements PurchaseDocumentRepository {
  private readonly headers: PurchaseDocumentHeaderRow[] = [];
  private readonly linesByDoc = new Map<string, NewPurchaseDocumentLine[]>();

  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly grades: ProductGradeRepository,
    private readonly tripShipments: TripShipmentRepository,
    private readonly tripSales: TripSaleRepository,
    private readonly tripShortages: TripShortageRepository,
  ) {}

  async insertDocumentWithLines(header: PurchaseDocumentHeaderRow, lines: NewPurchaseDocumentLine[]): Promise<void> {
    for (const line of lines) {
      await this.batchRepo.save(line.batch);
    }
    this.headers.push(header);
    this.linesByDoc.set(header.id, lines);
  }

  async hasProductGradeInAnyLine(productGradeId: string): Promise<boolean> {
    for (const lines of this.linesByDoc.values()) {
      for (const line of lines) {
        if (line.productGradeId === productGradeId) {
          return true;
        }
      }
    }
    return false;
  }

  async deleteById(documentId: string): Promise<void> {
    const headerIdx = this.headers.findIndex((h) => h.id === documentId);
    if (headerIdx === -1) {
      throw new PurchaseDocumentNotFoundError(documentId);
    }
    const lines = this.linesByDoc.get(documentId) ?? [];
    const batchIds = lines.map((l) => l.batch.getId());
    if (batchIds.length > 0) {
      await this.tripSales.deleteByBatchIds(batchIds);
      await this.tripShortages.deleteByBatchIds(batchIds);
      await this.tripShipments.deleteByBatchIds(batchIds);
    }
    for (const batchId of batchIds) {
      await this.batchRepo.deleteById(batchId);
    }
    this.headers.splice(headerIdx, 1);
    this.linesByDoc.delete(documentId);
  }

  async listSummaries(): Promise<PurchaseDocumentSummary[]> {
    return this.headers
      .map((d) => ({
        id: d.id,
        documentNumber: d.documentNumber,
        docDate: formatHeaderDate(d.docDate),
        warehouseId: d.warehouseId,
        lineCount: this.linesByDoc.get(d.id)?.length ?? 0,
        createdByUserId: d.createdByUserId ?? null,
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
      createdByUserId: header.createdByUserId ?? null,
      lines: detailLines,
    };
  }
}

function formatHeaderDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
