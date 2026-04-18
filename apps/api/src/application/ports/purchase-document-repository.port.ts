import type { Batch } from "@birzha/domain";

export type PurchaseDocumentHeaderRow = {
  id: string;
  documentNumber: string;
  docDate: Date;
  supplierName: string | null;
  buyerLabel: string | null;
  warehouseId: string;
  extraCostKopecks: bigint;
};

/** Строка накладной для сохранения: партия создаётся в use case и передаётся целиком. */
export type NewPurchaseDocumentLine = {
  id: string;
  lineNo: number;
  productGradeId: string;
  quantityGrams: bigint;
  packageCount: bigint | null;
  /** numeric(18,6) как строка для Drizzle */
  pricePerKgNumeric: string;
  lineTotalKopecks: bigint;
  batch: Batch;
};

export type PurchaseDocumentSummary = {
  id: string;
  documentNumber: string;
  docDate: string;
  warehouseId: string;
  lineCount: number;
};

export type PurchaseDocumentLineDetail = {
  lineNo: number;
  productGradeId: string;
  productGradeCode: string;
  batchId: string;
  totalKg: number;
  packageCount: string | null;
  pricePerKg: number;
  lineTotalKopecks: string;
};

export type PurchaseDocumentDetail = {
  id: string;
  documentNumber: string;
  docDate: string;
  supplierName: string | null;
  buyerLabel: string | null;
  warehouseId: string;
  extraCostKopecks: string;
  createdAt: string | null;
  lines: PurchaseDocumentLineDetail[];
};

export interface PurchaseDocumentRepository {
  insertDocumentWithLines(header: PurchaseDocumentHeaderRow, lines: NewPurchaseDocumentLine[]): Promise<void>;
  listSummaries(): Promise<PurchaseDocumentSummary[]>;
  findByIdWithLines(id: string): Promise<PurchaseDocumentDetail | null>;
}
