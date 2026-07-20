import type { Batch } from "@birzha/domain";

export type PurchaseDocumentHeaderRow = {
  id: string;
  documentNumber: string;
  docDate: Date;
  supplierName: string | null;
  supplierId?: string | null;
  buyerLabel: string | null;
  warehouseId: string;
  extraCostKopecks: bigint;
  createdByUserId?: string | null;
};

/** Строка накладной для сохранения: партия создаётся в use case и передаётся целиком. */
export type NewPurchaseDocumentLine = {
  id: string;
  lineNo: number;
  productGradeId: string;
  /** Нетто (остаток партии). */
  quantityGrams: bigint;
  /** Брутто с весов. */
  grossQuantityGrams: bigint;
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
  createdByUserId: string | null;
};

export type PurchaseDocumentLineDetail = {
  lineNo: number;
  productGradeId: string;
  productGradeCode: string;
  batchId: string;
  /** Нетто, кг. */
  totalKg: number;
  /** Брутто, кг. */
  grossKg: number;
  packageCount: string | null;
  pricePerKg: number;
  lineTotalKopecks: string;
};

export type PurchaseDocumentDetail = {
  id: string;
  documentNumber: string;
  docDate: string;
  supplierName: string | null;
  supplierId: string | null;
  buyerLabel: string | null;
  warehouseId: string;
  extraCostKopecks: string;
  createdAt: string | null;
  createdByUserId: string | null;
  lines: PurchaseDocumentLineDetail[];
};

export interface PurchaseDocumentRepository {
  insertDocumentWithLines(header: PurchaseDocumentHeaderRow, lines: NewPurchaseDocumentLine[]): Promise<void>;
  listSummaries(): Promise<PurchaseDocumentSummary[]>;
  findByIdWithLines(id: string): Promise<PurchaseDocumentDetail | null>;
  /** Удаляет шапку, строки, партии, записи рейса по `batch_id`. */
  deleteById(documentId: string): Promise<void>;
  /**
   * Полная замена строк документа: удаляет старые партии/строки, пишет новые.
   * Вызывающий use case обязан проверить блокировки (ПН / движения).
   */
  replaceDocumentLines(documentId: string, lines: NewPurchaseDocumentLine[]): Promise<void>;
  /** Шапка накладной: номер и/или дата. */
  updateHeader(
    documentId: string,
    patch: { documentNumber?: string; docDate?: Date },
  ): Promise<void>;
  hasProductGradeInAnyLine(productGradeId: string): Promise<boolean>;
}
